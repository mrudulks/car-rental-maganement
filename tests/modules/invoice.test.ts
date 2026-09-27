import { beforeEach, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db/client'
import {
  issueInvoice,
  getInvoiceForBooking,
  financialYear,
} from '@/server/modules/billing/invoice'
import { addCharge, getBill, ensureRentalCharge, recordPayment } from '@/server/modules/billing/service'
import { createBooking, cancelBooking, checkOut } from '@/server/modules/bookings/service'
import { resetDatabase, seedOrg, type SeededOrg } from '../helpers/db'
import { authFor } from '../helpers/auth'

const day = (n: number) => {
  const d = new Date('2026-06-01T10:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

describe('financial year', () => {
  it('runs April to March', () => {
    expect(financialYear(new Date('2026-04-01T00:00:00Z'))).toBe('2026-27')
    expect(financialYear(new Date('2026-12-31T00:00:00Z'))).toBe('2026-27')
    expect(financialYear(new Date('2027-03-31T00:00:00Z'))).toBe('2026-27')
    expect(financialYear(new Date('2027-04-01T00:00:00Z'))).toBe('2027-28')
  })

  it('pads the second year to two digits across a century', () => {
    expect(financialYear(new Date('2099-05-01T00:00:00Z'))).toBe('2099-00')
  })
})

describe('invoices', () => {
  let alpha: SeededOrg
  let beta: SeededOrg

  beforeEach(async () => {
    await resetDatabase()
    alpha = await seedOrg('alpha')
    beta = await seedOrg('beta')
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const outOnRent = async (org: SeededOrg, offset = 0) => {
    const auth = await authFor(org.org.id)
    const booking = await createBooking(auth, {
      vehicleId: org.vehicle.id,
      customerId: org.customer.id,
      startAt: day(1 + offset * 10),
      endAt: day(4 + offset * 10),
      rateType: 'DAILY',
      notes: null,
    })
    await ensureRentalCharge(auth, booking.id)
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'ACTIVE' } })
    return { auth, booking }
  }

  it('issues a numbered invoice carrying the supplier and customer details', async () => {
    const { auth, booking } = await outOnRent(alpha)
    await prisma.organization.update({
      where: { id: alpha.org.id },
      data: {
        legalName: 'Alpha Rentals Pvt Ltd',
        gstin: '27AAPFU0939F1ZV',
        addressLine: '12 MG Road',
        city: 'Pune',
        state: 'Maharashtra',
        stateCode: '27',
        postalCode: '411001',
      },
    })

    const invoice = await issueInvoice(auth, booking.id)

    expect(invoice.invoiceNumber).toMatch(/^INV\/\d{4}-\d{2}\/0001$/)
    expect(invoice.supplierName).toBe('Alpha Rentals Pvt Ltd')
    expect(invoice.supplierGstin).toBe('27AAPFU0939F1ZV')
    expect(invoice.supplierAddress).toBe('12 MG Road, Pune, Maharashtra, 411001')
    expect(invoice.customerName).toBe('alpha Customer')
    expect(invoice.placeOfSupply).toBe('Maharashtra')
    expect(invoice.lines).toHaveLength(1)
    expect(invoice.lines[0]!.sacCode).toBe('9966')
  })

  it('falls back to the trading name when no legal name is set', async () => {
    const { auth, booking } = await outOnRent(alpha)
    const invoice = await issueInvoice(auth, booking.id)
    expect(invoice.supplierName).toBe('alpha Rentals')
  })

  it('totals match the bill exactly', async () => {
    const { auth, booking } = await outOnRent(alpha)
    await addCharge(auth, booking.id, {
      kind: 'EXTRA', description: 'Child seat', quantity: 2, unitAmount: '250.00', taxable: true,
    })
    await addCharge(auth, booking.id, {
      kind: 'DAMAGE', description: 'Toll recovered', quantity: 1, unitAmount: '200.00', taxable: false,
    })

    const bill = await getBill(auth, booking.id)
    const invoice = await issueInvoice(auth, booking.id)

    expect(invoice.taxableTotal).toBe(bill.taxable)
    expect(invoice.nonTaxableTotal).toBe(bill.nonTaxable)
    expect(invoice.cgstTotal).toBe(bill.cgst)
    expect(invoice.sgstTotal).toBe(bill.sgst)
    expect(invoice.grandTotal).toBe(bill.total)

    // Line totals must add up to the invoice total, with no drift.
    const sum = invoice.lines.reduce((t, l) => t + Number(l.lineTotal), 0)
    expect(sum.toFixed(2)).toBe(Number(invoice.grandTotal).toFixed(2))
  })

  it('leaves a non-taxable line without GST or a SAC code', async () => {
    const { auth, booking } = await outOnRent(alpha)
    await addCharge(auth, booking.id, {
      kind: 'DAMAGE', description: 'Toll recovered', quantity: 1, unitAmount: '200.00', taxable: false,
    })
    const invoice = await issueInvoice(auth, booking.id)
    const line = invoice.lines.find((l) => l.description === 'Toll recovered')!
    expect(line.cgstAmount).toBe('0.00')
    expect(line.sgstAmount).toBe('0.00')
    expect(line.sacCode).toBeNull()
    expect(line.lineTotal).toBe('200.00')
  })

  describe('numbering', () => {
    it('runs consecutively within the organization', async () => {
      const a = await outOnRent(alpha, 0)
      const b = await outOnRent(alpha, 1)
      expect((await issueInvoice(a.auth, a.booking.id)).invoiceNumber).toMatch(/0001$/)
      expect((await issueInvoice(b.auth, b.booking.id)).invoiceNumber).toMatch(/0002$/)
    })

    it('starts again at 0001 for another organization', async () => {
      const a = await outOnRent(alpha)
      const b = await outOnRent(beta)
      expect((await issueInvoice(a.auth, a.booking.id)).invoiceNumber).toMatch(/0001$/)
      expect((await issueInvoice(b.auth, b.booking.id)).invoiceNumber).toMatch(/0001$/)
    })

    it('restarts when the financial year rolls over', async () => {
      // Last year ended on number 87; this year's first invoice is 0001 again.
      await prisma.organization.update({
        where: { id: alpha.org.id },
        data: { invoiceFy: '2019-20', invoiceSeq: 87 },
      })

      const b = await outOnRent(alpha, 1)
      const invoice = await issueInvoice(b.auth, b.booking.id)
      expect(invoice.invoiceNumber).toMatch(/0001$/)
      expect(invoice.financialYear).not.toBe('2019-20')
    })

    it('gives one number per booking, however many times it is asked', async () => {
      const { auth, booking } = await outOnRent(alpha)
      const first = await issueInvoice(auth, booking.id)
      const again = await issueInvoice(auth, booking.id)
      expect(again.id).toBe(first.id)
      expect(again.invoiceNumber).toBe(first.invoiceNumber)
      expect(await prisma.invoice.count()).toBe(1)
    })

    it('never issues the same number twice under a race', async () => {
      const bookings = await Promise.all([0, 1, 2, 3].map((i) => outOnRent(alpha, i)))
      const results = await Promise.allSettled(
        bookings.map((b) => issueInvoice(b.auth, b.booking.id)),
      )
      const numbers = results
        .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof issueInvoice>>> => r.status === 'fulfilled')
        .map((r) => r.value.invoiceNumber)
      expect(new Set(numbers).size).toBe(numbers.length)
    })
  })

  describe('the snapshot holds', () => {
    it('does not change when the organization details change afterwards', async () => {
      const { auth, booking } = await outOnRent(alpha)
      await prisma.organization.update({
        where: { id: alpha.org.id },
        data: { legalName: 'Original Name Ltd', gstRate: '18' },
      })
      const issued = await issueInvoice(auth, booking.id)

      await prisma.organization.update({
        where: { id: alpha.org.id },
        data: { legalName: 'Renamed Ltd', gstRate: '5' },
      })

      const reread = await getInvoiceForBooking(auth, booking.id)
      expect(reread!.supplierName).toBe('Original Name Ltd')
      expect(reread!.gstRate).toBe('18')
      expect(reread!.grandTotal).toBe(issued.grandTotal)
    })

    it('refuses further charges once issued', async () => {
      const { auth, booking } = await outOnRent(alpha)
      await issueInvoice(auth, booking.id)
      await expect(
        addCharge(auth, booking.id, {
          kind: 'EXTRA', description: 'Late addition', quantity: 1, unitAmount: '100.00', taxable: true,
        }),
      ).rejects.toThrow(/already been invoiced/i)
    })

    it('still allows payments against an issued invoice', async () => {
      const { auth, booking } = await outOnRent(alpha)
      const invoice = await issueInvoice(auth, booking.id)
      await expect(
        recordPayment(auth, booking.id, {
          kind: 'RENTAL', amount: invoice.grandTotal, method: 'CASH', reference: null, notes: null,
        }),
      ).resolves.toBeTruthy()
      expect((await getBill(auth, booking.id)).balance).toBe('0.00')
    })
  })

  describe('rules', () => {
    it('refuses to invoice a booking that has not gone out', async () => {
      const auth = await authFor(alpha.org.id)
      const booking = await createBooking(auth, {
        vehicleId: alpha.vehicle.id, customerId: alpha.customer.id,
        startAt: day(1), endAt: day(4), rateType: 'DAILY', notes: null,
      })
      await expect(issueInvoice(auth, booking.id)).rejects.toThrow(/Hand over the keys/i)
    })

    it('refuses to invoice a cancelled booking', async () => {
      const auth = await authFor(alpha.org.id)
      const booking = await createBooking(auth, {
        vehicleId: alpha.vehicle.id, customerId: alpha.customer.id,
        startAt: day(1), endAt: day(4), rateType: 'DAILY', notes: null,
      })
      await cancelBooking(auth, booking.id)
      await expect(issueInvoice(auth, booking.id)).rejects.toThrow(/cancelled/i)
    })

    it('survives the whole real flow: check out, invoice, check in', async () => {
      const auth = await authFor(alpha.org.id)
      const booking = await createBooking(auth, {
        vehicleId: alpha.vehicle.id, customerId: alpha.customer.id,
        startAt: day(1), endAt: day(4), rateType: 'DAILY', notes: null,
      })
      await checkOut(auth, booking.id, { odometer: 12500, fuelLevel: 80, notes: null })
      const invoice = await issueInvoice(auth, booking.id)
      expect(invoice.grandTotal).toBe('5310.00')
    })
  })

  describe('tenant isolation', () => {
    it('cannot issue against another organization booking', async () => {
      const { booking } = await outOnRent(alpha)
      const rival = await authFor(beta.org.id)
      await expect(issueInvoice(rival, booking.id)).rejects.toThrow(/no longer on your list/i)
      expect(await prisma.invoice.count()).toBe(0)
    })

    it('cannot read another organization invoice', async () => {
      const { auth, booking } = await outOnRent(alpha)
      await issueInvoice(auth, booking.id)
      const rival = await authFor(beta.org.id)
      expect(await getInvoiceForBooking(rival, booking.id)).toBeNull()
    })

    it('scopes invoice lines too', async () => {
      const { auth, booking } = await outOnRent(alpha)
      await issueInvoice(auth, booking.id)
      const rival = await authFor(beta.org.id)
      expect(await rival.db.invoiceLine.findMany()).toHaveLength(0)
      expect(await auth.db.invoiceLine.findMany()).not.toHaveLength(0)
    })
  })
})

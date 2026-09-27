import { beforeEach, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db/client'
import { ForbiddenError } from '@/server/auth/permissions'
import {
  getBill,
  addCharge,
  removeCharge,
  recordPayment,
  ensureRentalCharge,
  getGstSettings,
  updateGstSettings,
  BillingError,
} from '@/server/modules/billing/service'
import { createBooking, cancelBooking } from '@/server/modules/bookings/service'
import { resetDatabase, seedOrg, type SeededOrg } from '../helpers/db'
import { authFor } from '../helpers/auth'

const day = (n: number) => {
  const d = new Date('2026-06-01T10:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

describe('billing', () => {
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

  /** A 3-day rental of the seeded vehicle at 1500/day = 4500 taxable. */
  const booked = async (role: 'OWNER' | 'MANAGER' | 'STAFF' = 'OWNER') => {
    const owner = await authFor(alpha.org.id)
    const booking = await createBooking(owner, {
      vehicleId: alpha.vehicle.id,
      customerId: alpha.customer.id,
      startAt: day(1),
      endAt: day(4),
      rateType: 'DAILY',
      notes: null,
    })
    await ensureRentalCharge(owner, booking.id)
    return { auth: await authFor(alpha.org.id, role), booking }
  }

  describe('the bill', () => {
    it('adds GST to the rental at the organization rate', async () => {
      const { auth, booking } = await booked()
      const bill = await getBill(auth, booking.id)

      expect(bill.gstRate).toBe('18')
      expect(bill.taxable).toBe('4500.00')
      expect(bill.cgst).toBe('405.00')
      expect(bill.sgst).toBe('405.00')
      expect(bill.total).toBe('5310.00')
      expect(bill.balance).toBe('5310.00')
      expect(bill.paid).toBe('0.00')
    })

    it('follows the organization rate when it changes', async () => {
      const { auth, booking } = await booked()
      await prisma.organization.update({ where: { id: alpha.org.id }, data: { gstRate: '5' } })

      const bill = await getBill(auth, booking.id)
      expect(bill.cgst).toBe('112.50')
      expect(bill.sgst).toBe('112.50')
      expect(bill.total).toBe('4725.00')
    })

    it('writes the rental line only once, however often check-out runs', async () => {
      const { auth, booking } = await booked()
      await ensureRentalCharge(auth, booking.id)
      await ensureRentalCharge(auth, booking.id)

      const bill = await getBill(auth, booking.id)
      expect(bill.charges.filter((c) => c.kind === 'RENTAL')).toHaveLength(1)
      expect(bill.total).toBe('5310.00')
    })

    it('keeps a non-taxable line out of the tax base', async () => {
      const { auth, booking } = await booked()
      await addCharge(auth, booking.id, {
        kind: 'DAMAGE',
        description: 'Recovered toll',
        quantity: 1,
        unitAmount: '200.00',
        taxable: false,
      })

      const bill = await getBill(auth, booking.id)
      expect(bill.taxable).toBe('4500.00')
      expect(bill.nonTaxable).toBe('200.00')
      expect(bill.tax).toBe('810.00')
      expect(bill.total).toBe('5510.00')
    })

    it('bills a late fee on top', async () => {
      const { auth, booking } = await booked()
      await addCharge(auth, booking.id, {
        kind: 'LATE_FEE',
        description: 'Returned 4 hours late',
        quantity: 4,
        unitAmount: '150.00',
        taxable: true,
      })

      const bill = await getBill(auth, booking.id)
      expect(bill.taxable).toBe('5100.00')
      expect(bill.total).toBe('6018.00')
    })
  })

  describe('payments', () => {
    it('reduces the balance', async () => {
      const { auth, booking } = await booked()
      await recordPayment(auth, booking.id, {
        kind: 'RENTAL',
        amount: '2000.00',
        method: 'UPI',
        reference: 'UPI/4471',
        notes: null,
      })

      const bill = await getBill(auth, booking.id)
      expect(bill.paid).toBe('2000.00')
      expect(bill.balance).toBe('3310.00')
      expect(bill.payments[0]!.method).toBe('UPI')
      expect(bill.payments[0]!.reference).toBe('UPI/4471')
    })

    it('settles to zero when paid in full', async () => {
      const { auth, booking } = await booked()
      await recordPayment(auth, booking.id, {
        kind: 'RENTAL', amount: '5310.00', method: 'CASH', reference: null, notes: null,
      })
      expect((await getBill(auth, booking.id)).balance).toBe('0.00')
    })

    it('holds a deposit apart from the bill', async () => {
      const { auth, booking } = await booked()
      await recordPayment(auth, booking.id, {
        kind: 'DEPOSIT', amount: '5000.00', method: 'CASH', reference: null, notes: null,
      })

      const bill = await getBill(auth, booking.id)
      // A deposit is held, not earned: it must not settle the rental.
      expect(bill.depositHeld).toBe('5000.00')
      expect(bill.paid).toBe('0.00')
      expect(bill.balance).toBe('5310.00')
    })

    it('returns a deposit', async () => {
      const owner = await authFor(alpha.org.id)
      const { booking } = await booked()
      await recordPayment(owner, booking.id, {
        kind: 'DEPOSIT', amount: '5000.00', method: 'CASH', reference: null, notes: null,
      })
      await recordPayment(owner, booking.id, {
        kind: 'DEPOSIT_REFUND', amount: '5000.00', method: 'CASH', reference: null, notes: null,
      })
      expect((await getBill(owner, booking.id)).depositHeld).toBe('0.00')
    })

    it('refuses to return more deposit than is held', async () => {
      const owner = await authFor(alpha.org.id)
      const { booking } = await booked()
      await recordPayment(owner, booking.id, {
        kind: 'DEPOSIT', amount: '5000.00', method: 'CASH', reference: null, notes: null,
      })
      await expect(
        recordPayment(owner, booking.id, {
          kind: 'DEPOSIT_REFUND', amount: '6000.00', method: 'CASH', reference: null, notes: null,
        }),
      ).rejects.toThrow(/Only 5000.00 is held/)
    })

    it('a refund puts the balance back', async () => {
      const owner = await authFor(alpha.org.id)
      const { booking } = await booked()
      await recordPayment(owner, booking.id, {
        kind: 'RENTAL', amount: '5310.00', method: 'CARD', reference: null, notes: null,
      })
      await recordPayment(owner, booking.id, {
        kind: 'REFUND', amount: '310.00', method: 'CARD', reference: null, notes: null,
      })
      const bill = await getBill(owner, booking.id)
      expect(bill.paid).toBe('5000.00')
      expect(bill.balance).toBe('310.00')
    })
  })

  describe('permissions', () => {
    it('staff may take money', async () => {
      const { booking } = await booked()
      const staff = await authFor(alpha.org.id, 'STAFF')
      await expect(
        recordPayment(staff, booking.id, {
          kind: 'RENTAL', amount: '100.00', method: 'CASH', reference: null, notes: null,
        }),
      ).resolves.toMatchObject({ amount: '100' })
    })

    it('staff may not refund, nor return a deposit', async () => {
      const { booking } = await booked()
      const staff = await authFor(alpha.org.id, 'STAFF')
      for (const kind of ['REFUND', 'DEPOSIT_REFUND'] as const) {
        await expect(
          recordPayment(staff, booking.id, {
            kind, amount: '100.00', method: 'CASH', reference: null, notes: null,
          }),
        ).rejects.toThrow(ForbiddenError)
      }
    })

    it('only an owner may change the GST settings', async () => {
      const manager = await authFor(alpha.org.id, 'MANAGER')
      await expect(getGstSettings(manager)).rejects.toThrow(ForbiddenError)
    })
  })

  describe('rules', () => {
    it('refuses to remove the rental line', async () => {
      const { auth, booking } = await booked()
      const bill = await getBill(auth, booking.id)
      const rental = bill.charges.find((c) => c.kind === 'RENTAL')!
      await expect(removeCharge(auth, rental.id)).rejects.toThrow(/cannot be removed/i)
    })

    it('removes an extra', async () => {
      const { auth, booking } = await booked()
      const extra = await addCharge(auth, booking.id, {
        kind: 'EXTRA', description: 'Child seat', quantity: 1, unitAmount: '250.00', taxable: true,
      })
      await removeCharge(auth, extra.id)
      expect((await getBill(auth, booking.id)).total).toBe('5310.00')
    })

    it('refuses to charge a cancelled booking', async () => {
      const owner = await authFor(alpha.org.id)
      const { booking } = await booked()
      await cancelBooking(owner, booking.id)
      await expect(
        addCharge(owner, booking.id, {
          kind: 'EXTRA', description: 'Late', quantity: 1, unitAmount: '100.00', taxable: true,
        }),
      ).rejects.toThrow(/cancelled/i)
    })
  })

  describe('tenant isolation', () => {
    it('cannot read another organization bill', async () => {
      const { booking } = await booked()
      const rival = await authFor(beta.org.id)
      await expect(getBill(rival, booking.id)).rejects.toThrow(BillingError)
    })

    it('cannot record a payment against another organization booking', async () => {
      const { booking } = await booked()
      const rival = await authFor(beta.org.id)
      await expect(
        recordPayment(rival, booking.id, {
          kind: 'RENTAL', amount: '100.00', method: 'CASH', reference: null, notes: null,
        }),
      ).rejects.toThrow(BillingError)
      expect(await prisma.payment.count()).toBe(0)
    })
  })

  describe('GST settings', () => {
    it('round-trips, upper-casing the GSTIN', async () => {
      const owner = await authFor(alpha.org.id)
      await updateGstSettings(owner, {
        legalName: 'Alpha Rentals Pvt Ltd',
        gstin: '27AAPFU0939F1ZV',
        addressLine: '12 MG Road',
        city: 'Pune',
        state: 'Maharashtra',
        stateCode: '27',
        postalCode: '411001',
        gstRate: '12',
      })

      const settings = await getGstSettings(owner)
      expect(settings.gstin).toBe('27AAPFU0939F1ZV')
      expect(settings.gstRate).toBe('12')
      expect(settings.state).toBe('Maharashtra')
    })
  })
})

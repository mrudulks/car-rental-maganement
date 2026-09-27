import 'server-only'
import type { AuthContext } from '@/server/auth/dal'
import { assertCan } from '@/server/auth/permissions'
import { prisma } from '@/server/db/client'
import { fromPaise, splitGst, toPaise } from './money'
import { BillingError, getBill } from './service'

/** Renting of transport vehicles. */
export const DEFAULT_SAC = '9966'

/**
 * India's financial year runs April to March, and invoice numbers restart with it.
 * A date in March 2027 belongs to 2026-27; April 2027 starts 2027-28.
 */
export function financialYear(date: Date): string {
  const year = date.getFullYear()
  const start = date.getMonth() >= 3 ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

export type InvoiceDTO = {
  id: string
  invoiceNumber: string
  financialYear: string
  issuedAt: Date
  supplierName: string
  supplierGstin: string | null
  supplierAddress: string | null
  supplierState: string | null
  supplierStateCode: string | null
  customerName: string
  customerPhone: string
  customerAddress: string | null
  placeOfSupply: string | null
  gstRate: string
  taxableTotal: string
  nonTaxableTotal: string
  cgstTotal: string
  sgstTotal: string
  grandTotal: string
  issuedBy: string | null
  lines: Array<{
    id: string
    description: string
    sacCode: string | null
    quantity: string
    unitAmount: string
    taxableValue: string
    taxable: boolean
    cgstRate: string
    cgstAmount: string
    sgstRate: string
    sgstAmount: string
    lineTotal: string
  }>
}

const SELECT = {
  id: true,
  invoiceNumber: true,
  financialYear: true,
  issuedAt: true,
  supplierName: true,
  supplierGstin: true,
  supplierAddress: true,
  supplierState: true,
  supplierStateCode: true,
  customerName: true,
  customerPhone: true,
  customerAddress: true,
  placeOfSupply: true,
  gstRate: true,
  taxableTotal: true,
  nonTaxableTotal: true,
  cgstTotal: true,
  sgstTotal: true,
  grandTotal: true,
  issuedByUser: { select: { name: true } },
  lines: {
    orderBy: { position: 'asc' as const },
    select: {
      id: true,
      description: true,
      sacCode: true,
      quantity: true,
      unitAmount: true,
      taxableValue: true,
      taxable: true,
      cgstRate: true,
      cgstAmount: true,
      sgstRate: true,
      sgstAmount: true,
      lineTotal: true,
    },
  },
} as const

type Row = Record<string, unknown> & {
  issuedByUser: { name: string } | null
  lines: Array<Record<string, unknown>>
}

/** Always two decimal places: Prisma returns Decimal("5310.00") as "5310". */
const s = (v: unknown) => String(v)
const m = (v: unknown) => fromPaise(toPaise(String(v)))

function toDTO(row: Row): InvoiceDTO {
  const { issuedByUser, lines, ...rest } = row
  return {
    ...(rest as unknown as Omit<InvoiceDTO, 'gstRate' | 'taxableTotal' | 'nonTaxableTotal' | 'cgstTotal' | 'sgstTotal' | 'grandTotal' | 'issuedBy' | 'lines'>),
    gstRate: s(rest.gstRate),
    taxableTotal: m(rest.taxableTotal),
    nonTaxableTotal: m(rest.nonTaxableTotal),
    cgstTotal: m(rest.cgstTotal),
    sgstTotal: m(rest.sgstTotal),
    grandTotal: m(rest.grandTotal),
    issuedBy: issuedByUser?.name ?? null,
    lines: lines.map((l) => ({
      id: s(l.id),
      description: s(l.description),
      sacCode: l.sacCode == null ? null : s(l.sacCode),
      quantity: s(l.quantity),
      unitAmount: m(l.unitAmount),
      taxableValue: m(l.taxableValue),
      taxable: Boolean(l.taxable),
      cgstRate: s(l.cgstRate),
      cgstAmount: m(l.cgstAmount),
      sgstRate: s(l.sgstRate),
      sgstAmount: m(l.sgstAmount),
      lineTotal: m(l.lineTotal),
    })),
  }
}

export async function getInvoiceForBooking(
  auth: AuthContext,
  bookingId: string,
): Promise<InvoiceDTO | null> {
  assertCan(auth.user.role, 'payment:read')
  const row = await auth.db.invoice.findFirst({ where: { bookingId }, select: SELECT })
  return row ? toDTO(row as Row) : null
}

/**
 * Issue the invoice for a booking.
 *
 * Returns the existing one if there already is one: an invoice number, once given to a
 * customer, cannot be handed out twice or quietly replaced.
 */
export async function issueInvoice(auth: AuthContext, bookingId: string): Promise<InvoiceDTO> {
  assertCan(auth.user.role, 'invoice:issue')

  const existing = await auth.db.invoice.findFirst({ where: { bookingId }, select: SELECT })
  if (existing) return toDTO(existing as Row)

  const booking = await auth.db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      customer: { select: { fullName: true, phone: true, address: true } },
      branch: { select: { name: true, address: true } },
    },
  })
  if (!booking) throw new BillingError('That booking is no longer on your list')
  if (booking.status === 'CANCELLED') {
    throw new BillingError('A cancelled booking cannot be invoiced.')
  }
  if (booking.status === 'RESERVED') {
    throw new BillingError('Hand over the keys before invoicing — nothing has been billed yet.')
  }

  const bill = await getBill(auth, bookingId)
  if (bill.charges.length === 0) {
    throw new BillingError('There is nothing on this bill to invoice.')
  }

  const org = await auth.db.organization.findUniqueOrThrow({
    where: { id: auth.organization.id },
    select: {
      name: true,
      legalName: true,
      gstin: true,
      addressLine: true,
      city: true,
      state: true,
      stateCode: true,
      postalCode: true,
      gstRate: true,
    },
  })

  const rate = String(org.gstRate)
  const half = fromPaise(toPaise(String(Number(rate) / 2)))

  const lines = bill.charges.map((charge, index) => {
    const paise = toPaise(charge.amount)
    const split = charge.taxable
      ? splitGst(paise, rate)
      : { taxable: paise, cgst: 0, sgst: 0, tax: 0, total: paise }
    return {
      organizationId: auth.organization.id,
      description: charge.description,
      sacCode: charge.taxable ? DEFAULT_SAC : null,
      quantity: charge.quantity,
      unitAmount: charge.unitAmount,
      taxableValue: fromPaise(split.taxable),
      taxable: charge.taxable,
      cgstRate: charge.taxable ? half : '0',
      cgstAmount: fromPaise(split.cgst),
      sgstRate: charge.taxable ? half : '0',
      sgstAmount: fromPaise(split.sgst),
      lineTotal: fromPaise(split.total),
      position: index,
    }
  })

  const address = [org.addressLine, org.city, org.state, org.postalCode].filter(Boolean).join(', ')
  const now = new Date()
  const fy = financialYear(now)

  const created = await prisma.$transaction(async (tx) => {
    // Numbers must be consecutive within the financial year, so the counter restarts
    // when the year rolls over. Done inside the transaction so two people invoicing at
    // the same moment cannot be handed the same number.
    const current = await tx.organization.findUniqueOrThrow({
      where: { id: auth.organization.id },
      select: { invoiceSeq: true, invoiceFy: true },
    })
    const next = current.invoiceFy === fy ? current.invoiceSeq + 1 : 1

    await tx.organization.update({
      where: { id: auth.organization.id },
      data: { invoiceSeq: next, invoiceFy: fy },
    })

    return tx.invoice.create({
      data: {
        organizationId: auth.organization.id,
        bookingId,
        invoiceNumber: `INV/${fy}/${String(next).padStart(4, '0')}`,
        financialYear: fy,
        supplierName: org.legalName || org.name,
        supplierGstin: org.gstin,
        supplierAddress: address || null,
        supplierState: org.state,
        supplierStateCode: org.stateCode,
        customerName: booking.customer.fullName,
        customerPhone: booking.customer.phone,
        customerAddress: booking.customer.address,
        placeOfSupply: org.state,
        gstRate: rate,
        taxableTotal: bill.taxable,
        nonTaxableTotal: bill.nonTaxable,
        cgstTotal: bill.cgst,
        sgstTotal: bill.sgst,
        grandTotal: bill.total,
        issuedByUserId: auth.user.id,
        lines: { create: lines },
      },
      select: SELECT,
    })
  })

  return toDTO(created as Row)
}

import 'server-only'
import type { ChargeKind, PaymentKind, PaymentMethod } from '@/generated/prisma/enums'
import type { AuthContext } from '@/server/auth/dal'
import { assertCan } from '@/server/auth/permissions'
import { fromPaise, lineAmount, splitGst, toPaise } from './money'
import type { ChargeInput, GstSettingsInput, PaymentInput } from './schema'

export class BillingError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}

export type ChargeDTO = {
  id: string
  kind: ChargeKind
  description: string
  quantity: string
  unitAmount: string
  amount: string
  taxable: boolean
  createdAt: Date
}

export type PaymentDTO = {
  id: string
  kind: PaymentKind
  amount: string
  method: PaymentMethod
  reference: string | null
  notes: string | null
  receivedAt: Date
  receivedBy: string | null
}

/**
 * What the customer owes and what they have handed over.
 *
 * Deposits are tracked apart from rental money: a refundable deposit is not a supply,
 * so it carries no GST and must not count towards settling the bill.
 */
export type BillSummary = {
  charges: ChargeDTO[]
  payments: PaymentDTO[]
  gstRate: string
  taxable: string
  nonTaxable: string
  cgst: string
  sgst: string
  tax: string
  total: string
  paid: string
  balance: string
  depositHeld: string
}

const CHARGE_SELECT = {
  id: true,
  kind: true,
  description: true,
  quantity: true,
  unitAmount: true,
  amount: true,
  taxable: true,
  createdAt: true,
} as const

const PAYMENT_SELECT = {
  id: true,
  kind: true,
  amount: true,
  method: true,
  reference: true,
  notes: true,
  receivedAt: true,
  receivedByUser: { select: { name: true } },
} as const

export async function getBill(auth: AuthContext, bookingId: string): Promise<BillSummary> {
  assertCan(auth.user.role, 'payment:read')

  const booking = await auth.db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true },
  })
  if (!booking) throw new BillingError('That booking is no longer on your list')

  const [chargeRows, paymentRows, org] = await Promise.all([
    auth.db.bookingCharge.findMany({
      where: { bookingId },
      select: CHARGE_SELECT,
      orderBy: { createdAt: 'asc' },
    }),
    auth.db.payment.findMany({
      where: { bookingId },
      select: PAYMENT_SELECT,
      orderBy: { receivedAt: 'asc' },
    }),
    auth.db.organization.findUniqueOrThrow({
      where: { id: auth.organization.id },
      select: { gstRate: true },
    }),
  ])

  const charges: ChargeDTO[] = chargeRows.map((c) => ({
    ...c,
    quantity: String(c.quantity),
    unitAmount: String(c.unitAmount),
    amount: String(c.amount),
  }))

  const payments: PaymentDTO[] = paymentRows.map(({ receivedByUser, ...p }) => ({
    ...p,
    amount: String(p.amount),
    receivedBy: receivedByUser?.name ?? null,
  }))

  const rate = String(org.gstRate)

  let taxable = 0
  let nonTaxable = 0
  let cgst = 0
  let sgst = 0

  for (const charge of charges) {
    const paise = toPaise(charge.amount)
    if (!charge.taxable) {
      nonTaxable += paise
      continue
    }
    const split = splitGst(paise, rate)
    taxable += split.taxable
    cgst += split.cgst
    sgst += split.sgst
  }

  const total = taxable + cgst + sgst + nonTaxable

  // Deposits sit outside the bill: they are held, not earned.
  let paid = 0
  let depositHeld = 0
  for (const payment of payments) {
    const paise = toPaise(payment.amount)
    if (payment.kind === 'RENTAL') paid += paise
    else if (payment.kind === 'REFUND') paid -= paise
    else if (payment.kind === 'DEPOSIT') depositHeld += paise
    else if (payment.kind === 'DEPOSIT_REFUND') depositHeld -= paise
  }

  return {
    charges,
    payments,
    gstRate: rate,
    taxable: fromPaise(taxable),
    nonTaxable: fromPaise(nonTaxable),
    cgst: fromPaise(cgst),
    sgst: fromPaise(sgst),
    tax: fromPaise(cgst + sgst),
    total: fromPaise(total),
    paid: fromPaise(paid),
    balance: fromPaise(total - paid),
    depositHeld: fromPaise(depositHeld),
  }
}

/**
 * The rental line, written when the vehicle goes out so the bill exists from the moment
 * the customer has the keys. Idempotent: checking out cannot bill the rental twice.
 */
export async function ensureRentalCharge(
  auth: AuthContext,
  bookingId: string,
): Promise<void> {
  const existing = await auth.db.bookingCharge.count({
    where: { bookingId, kind: 'RENTAL' },
  })
  if (existing > 0) return

  const booking = await auth.db.booking.findUnique({
    where: { id: bookingId },
    select: { rateType: true, ratePerUnit: true, estimatedTotal: true },
  })
  if (!booking) throw new BillingError('That booking is no longer on your list')

  const unit = String(booking.ratePerUnit)
  const totalPaise = toPaise(String(booking.estimatedTotal))
  const unitPaise = toPaise(unit)
  const quantity = unitPaise === 0 ? 1 : totalPaise / unitPaise

  await auth.db.bookingCharge.create({
    data: {
      organizationId: auth.organization.id,
      bookingId,
      kind: 'RENTAL',
      description: `Vehicle rental (${booking.rateType.toLowerCase()})`,
      quantity: String(quantity),
      unitAmount: unit,
      amount: String(booking.estimatedTotal),
      taxable: true,
    },
  })
}

export async function addCharge(
  auth: AuthContext,
  bookingId: string,
  input: ChargeInput,
): Promise<ChargeDTO> {
  assertCan(auth.user.role, 'payment:record')

  const booking = await auth.db.booking.findUnique({
    where: { id: bookingId },
    select: { status: true },
  })
  if (!booking) throw new BillingError('That booking is no longer on your list')
  if (booking.status === 'CANCELLED') {
    throw new BillingError('A cancelled booking cannot be charged.')
  }

  const amount = lineAmount(input.quantity, input.unitAmount)

  const row = await auth.db.bookingCharge.create({
    data: {
      organizationId: auth.organization.id,
      bookingId,
      kind: input.kind,
      description: input.description,
      quantity: String(input.quantity),
      unitAmount: input.unitAmount,
      amount,
      taxable: input.taxable,
      createdByUserId: auth.user.id,
    },
    select: CHARGE_SELECT,
  })

  return {
    ...row,
    quantity: String(row.quantity),
    unitAmount: String(row.unitAmount),
    amount: String(row.amount),
  }
}

export async function removeCharge(auth: AuthContext, chargeId: string): Promise<void> {
  assertCan(auth.user.role, 'payment:record')

  const charge = await auth.db.bookingCharge.findUnique({
    where: { id: chargeId },
    select: { kind: true },
  })
  if (!charge) throw new BillingError('That charge is no longer on the bill')
  if (charge.kind === 'RENTAL') {
    throw new BillingError('The rental line comes from the booking and cannot be removed.')
  }

  await auth.db.bookingCharge.deleteMany({ where: { id: chargeId } })
}

export async function recordPayment(
  auth: AuthContext,
  bookingId: string,
  input: PaymentInput,
): Promise<PaymentDTO> {
  // Taking money is counter work; giving it back is not.
  assertCan(auth.user.role, 'payment:record')
  if (input.kind === 'REFUND' || input.kind === 'DEPOSIT_REFUND') {
    assertCan(auth.user.role, 'payment:refund')
  }

  const booking = await auth.db.booking.findUnique({
    where: { id: bookingId },
    select: { status: true },
  })
  if (!booking) throw new BillingError('That booking is no longer on your list')

  if (input.kind === 'DEPOSIT_REFUND') {
    const bill = await getBill(auth, bookingId)
    if (toPaise(input.amount) > toPaise(bill.depositHeld)) {
      throw new BillingError(
        `Only ${bill.depositHeld} is held as a deposit on this booking.`,
        'amount',
      )
    }
  }

  const row = await auth.db.payment.create({
    data: {
      organizationId: auth.organization.id,
      bookingId,
      kind: input.kind,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
      receivedByUserId: auth.user.id,
    },
    select: PAYMENT_SELECT,
  })

  const { receivedByUser, ...payment } = row
  return { ...payment, amount: String(payment.amount), receivedBy: receivedByUser?.name ?? null }
}

export async function getGstSettings(auth: AuthContext) {
  assertCan(auth.user.role, 'org:manage')
  const org = await auth.db.organization.findUniqueOrThrow({
    where: { id: auth.organization.id },
    select: {
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
  return { ...org, gstRate: String(org.gstRate) }
}

export async function updateGstSettings(auth: AuthContext, input: GstSettingsInput) {
  assertCan(auth.user.role, 'org:manage')
  await auth.db.organization.updateMany({
    where: { id: auth.organization.id },
    data: input,
  })
}

'use server'

import { refresh } from 'next/cache'
import { requireAuth } from '@/server/auth/dal'
import { ForbiddenError } from '@/server/auth/permissions'
import { chargeSchema, paymentSchema, gstSettingsSchema } from '@/server/modules/billing/schema'
import {
  addCharge,
  removeCharge,
  recordPayment,
  updateGstSettings,
  BillingError,
} from '@/server/modules/billing/service'

export type BillingFormState = {
  error?: string
  fieldErrors?: Record<string, string>
  values?: Record<string, string>
  ok?: boolean
}

function values(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of formData.entries()) if (typeof v === 'string') out[k] = v
  return out
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

function toState(error: unknown, v: Record<string, string>): BillingFormState {
  if (error instanceof BillingError) {
    return error.field
      ? { fieldErrors: { [error.field]: error.message }, values: v }
      : { error: error.message, values: v }
  }
  if (error instanceof ForbiddenError) {
    return { error: 'Your role does not allow that.', values: v }
  }
  throw error
}

export async function addChargeAction(
  bookingId: string,
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const auth = await requireAuth()
  const v = values(formData)

  const parsed = chargeSchema.safeParse({
    kind: v.kind,
    description: v.description,
    quantity: v.quantity || 1,
    unitAmount: v.unitAmount,
    taxable: v.taxable === 'on',
  })
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values: v }

  try {
    await addCharge(auth, bookingId, parsed.data)
  } catch (error) {
    return toState(error, v)
  }

  refresh()
  return { ok: true }
}

export async function recordPaymentAction(
  bookingId: string,
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const auth = await requireAuth()
  const v = values(formData)

  const parsed = paymentSchema.safeParse({
    kind: v.kind,
    amount: v.amount,
    method: v.method,
    reference: v.reference,
    notes: v.notes,
  })
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values: v }

  try {
    await recordPayment(auth, bookingId, parsed.data)
  } catch (error) {
    return toState(error, v)
  }

  refresh()
  return { ok: true }
}

export async function removeChargeAction(chargeId: string): Promise<{ error?: string }> {
  const auth = await requireAuth()
  try {
    await removeCharge(auth, chargeId)
  } catch (error) {
    if (error instanceof BillingError) return { error: error.message }
    if (error instanceof ForbiddenError) return { error: 'Your role does not allow that.' }
    throw error
  }
  refresh()
  return {}
}

export async function saveGstSettingsAction(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const auth = await requireAuth()
  const v = values(formData)

  const parsed = gstSettingsSchema.safeParse({
    legalName: v.legalName,
    gstin: v.gstin ?? '',
    addressLine: v.addressLine,
    city: v.city,
    state: v.state,
    stateCode: v.stateCode ?? '',
    postalCode: v.postalCode ?? '',
    gstRate: v.gstRate,
  })
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values: v }

  try {
    await updateGstSettings(auth, parsed.data)
  } catch (error) {
    return toState(error, v)
  }

  refresh()
  return { ok: true }
}

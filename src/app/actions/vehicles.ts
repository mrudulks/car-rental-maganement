'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { requireAuth } from '@/server/auth/dal'
import { ForbiddenError } from '@/server/auth/permissions'
import { parseVehicleForm } from '@/server/modules/vehicles/schema'
import {
  createVehicle,
  updateVehicle,
  setVehicleStatus,
  deleteVehicle,
  VehicleError,
} from '@/server/modules/vehicles/service'

export type VehicleFormState = {
  error?: string
  fieldErrors?: Record<string, string>
  values?: Record<string, string>
}

function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of formData.entries()) {
    if (typeof v === 'string') out[k] = v
  }
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

/** Turn a thrown service error into something the form can show. */
function toState(error: unknown, values: Record<string, string>): VehicleFormState {
  if (error instanceof VehicleError) {
    return error.field
      ? { fieldErrors: { [error.field]: error.message }, values }
      : { error: error.message, values }
  }
  if (error instanceof ForbiddenError) {
    return { error: 'Your role does not allow that change.', values }
  }
  throw error
}

export async function createVehicleAction(
  _prev: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const auth = await requireAuth()
  const values = formValues(formData)

  const parsed = parseVehicleForm(values)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values }

  try {
    await createVehicle(auth, parsed.data)
  } catch (error) {
    return toState(error, values)
  }

  redirect('/fleet')
}

export async function updateVehicleAction(
  id: string,
  _prev: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const auth = await requireAuth()
  const values = formValues(formData)

  const parsed = parseVehicleForm(values)
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values }

  try {
    await updateVehicle(auth, id, parsed.data)
  } catch (error) {
    return toState(error, values)
  }

  redirect('/fleet')
}

export type ActionResult = { error?: string }

export async function setVehicleStatusAction(
  id: string,
  status: 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED',
): Promise<ActionResult> {
  const auth = await requireAuth()
  try {
    await setVehicleStatus(auth, id, status)
  } catch (error) {
    if (error instanceof VehicleError) return { error: error.message }
    if (error instanceof ForbiddenError) return { error: 'Your role does not allow that change.' }
    throw error
  }
  refresh()
  return {}
}

export async function deleteVehicleAction(id: string): Promise<ActionResult> {
  const auth = await requireAuth()
  try {
    await deleteVehicle(auth, id)
  } catch (error) {
    if (error instanceof VehicleError) return { error: error.message }
    if (error instanceof ForbiddenError) return { error: 'Your role does not allow that change.' }
    throw error
  }
  refresh()
  return {}
}

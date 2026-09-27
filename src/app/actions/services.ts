'use server'

import { refresh } from 'next/cache'
import { requireAuth } from '@/server/auth/dal'
import { ForbiddenError } from '@/server/auth/permissions'
import { serviceSchema } from '@/server/modules/services/schema'
import { scheduleService, cancelService, ServiceError } from '@/server/modules/services/service'

export type ServiceFormState = {
  error?: string
  fieldErrors?: Record<string, string>
  values?: Record<string, string>
  ok?: boolean
}

export async function scheduleServiceAction(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const auth = await requireAuth()
  const values: Record<string, string> = {}
  for (const [k, v] of formData.entries()) if (typeof v === 'string') values[k] = v

  const parsed = serviceSchema.safeParse(values)
  if (!parsed.success) {
    const errs: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !errs[key]) errs[key] = issue.message
    }
    return { fieldErrors: errs, values }
  }

  try {
    await scheduleService(auth, parsed.data)
  } catch (error) {
    if (error instanceof ServiceError) {
      return error.field
        ? { fieldErrors: { [error.field]: error.message }, values }
        : { error: error.message, values }
    }
    if (error instanceof ForbiddenError) {
      return { error: 'Your role does not allow that.', values }
    }
    throw error
  }

  refresh()
  return { ok: true }
}

export async function cancelServiceAction(id: string): Promise<{ error?: string }> {
  const auth = await requireAuth()
  try {
    await cancelService(auth, id)
  } catch (error) {
    if (error instanceof ServiceError) return { error: error.message }
    if (error instanceof ForbiddenError) return { error: 'Your role does not allow that.' }
    throw error
  }
  refresh()
  return {}
}

'use server'

import { redirect } from 'next/navigation'
import { requireAuth } from '@/server/auth/dal'
import { ForbiddenError } from '@/server/auth/permissions'
import { customerSchema } from '@/server/modules/customers/schema'
import { updateCustomer, CustomerError } from '@/server/modules/customers/service'

export type CustomerFormState = {
  error?: string
  fieldErrors?: Record<string, string>
  values?: Record<string, string>
}

export async function updateCustomerAction(
  id: string,
  _prev: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const auth = await requireAuth()
  const values: Record<string, string> = {}
  for (const [k, v] of formData.entries()) if (typeof v === 'string') values[k] = v

  const parsed = customerSchema.safeParse({
    fullName: values.fullName,
    phone: values.phone,
    email: values.email ?? '',
    licenceNumber: values.licenceNumber,
    address: values.address,
  })

  if (!parsed.success) {
    const errs: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !errs[key]) errs[key] = issue.message
    }
    return { fieldErrors: errs, values }
  }

  try {
    await updateCustomer(auth, id, parsed.data)
  } catch (error) {
    if (error instanceof CustomerError) return { error: error.message, values }
    if (error instanceof ForbiddenError) {
      return { error: 'Your role does not allow editing customers.', values }
    }
    throw error
  }

  redirect(`/customers/${id}`)
}

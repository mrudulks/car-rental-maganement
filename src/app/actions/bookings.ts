'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { requireAuth } from '@/server/auth/dal'
import { ForbiddenError } from '@/server/auth/permissions'
import {
  createBookingSchema,
  checkOutSchema,
  checkInSchema,
} from '@/server/modules/bookings/schema'
import {
  createBooking,
  cancelBooking,
  checkOut,
  checkIn,
  BookingError,
} from '@/server/modules/bookings/service'
import { customerSchema } from '@/server/modules/customers/schema'
import { createCustomer } from '@/server/modules/customers/service'

export type BookingFormState = {
  error?: string
  fieldErrors?: Record<string, string>
  values?: Record<string, string>
}

function formValues(formData: FormData): Record<string, string> {
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

export async function createBookingAction(
  _prev: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const auth = await requireAuth()
  const values = formValues(formData)

  // The counter works from a name and a phone number; the phone is what identifies a
  // returning customer, so this reuses their record instead of creating a second one.
  const customerParsed = customerSchema.safeParse({
    fullName: values.customerName,
    phone: values.customerPhone,
    email: '',
    licenceNumber: values.customerLicence,
    address: '',
  })
  if (!customerParsed.success) {
    const errs = fieldErrors(customerParsed.error.issues)
    return {
      fieldErrors: {
        ...(errs.fullName ? { customerName: errs.fullName } : {}),
        ...(errs.phone ? { customerPhone: errs.phone } : {}),
      },
      values,
    }
  }

  const bookingParsed = createBookingSchema.safeParse({
    vehicleId: values.vehicleId,
    customerId: 'pending',
    startAt: values.startAt,
    endAt: values.endAt,
    rateType: values.rateType,
    notes: values.notes,
  })
  if (!bookingParsed.success) {
    return { fieldErrors: fieldErrors(bookingParsed.error.issues), values }
  }

  let bookingId: string
  try {
    const customer = await createCustomer(auth, customerParsed.data)
    const booking = await createBooking(auth, {
      ...bookingParsed.data,
      customerId: customer.id,
    })
    bookingId = booking.id
  } catch (error) {
    if (error instanceof BookingError) {
      return error.field
        ? { fieldErrors: { [error.field]: error.message }, values }
        : { error: error.message, values }
    }
    if (error instanceof ForbiddenError) {
      return { error: 'Your role does not allow taking bookings.', values }
    }
    throw error
  }

  redirect(`/bookings/${bookingId}`)
}

export async function cancelBookingAction(id: string): Promise<{ error?: string }> {
  const auth = await requireAuth()
  try {
    await cancelBooking(auth, id)
  } catch (error) {
    if (error instanceof BookingError) return { error: error.message }
    if (error instanceof ForbiddenError) return { error: 'Your role does not allow cancelling.' }
    throw error
  }
  refresh()
  return {}
}

export async function checkOutAction(
  id: string,
  _prev: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const auth = await requireAuth()
  const values = formValues(formData)

  const parsed = checkOutSchema.safeParse({
    odometer: values.odometer,
    fuelLevel: values.fuelLevel,
    notes: values.notes,
  })
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values }

  try {
    await checkOut(auth, id, parsed.data)
  } catch (error) {
    if (error instanceof BookingError) {
      return error.field
        ? { fieldErrors: { [error.field]: error.message }, values }
        : { error: error.message, values }
    }
    if (error instanceof ForbiddenError) {
      return { error: 'Your role does not allow handing over keys.', values }
    }
    throw error
  }

  redirect(`/bookings/${id}`)
}

export async function checkInAction(
  id: string,
  _prev: BookingFormState,
  formData: FormData,
): Promise<BookingFormState> {
  const auth = await requireAuth()
  const values = formValues(formData)

  const parsed = checkInSchema.safeParse({
    odometer: values.odometer,
    fuelLevel: values.fuelLevel,
    notes: values.notes,
    damageNotes: values.damageNotes,
  })
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues), values }

  try {
    await checkIn(auth, id, parsed.data)
  } catch (error) {
    if (error instanceof BookingError) {
      return error.field
        ? { fieldErrors: { [error.field]: error.message }, values }
        : { error: error.message, values }
    }
    if (error instanceof ForbiddenError) {
      return { error: 'Your role does not allow taking vehicles back.', values }
    }
    throw error
  }

  redirect(`/bookings/${id}`)
}

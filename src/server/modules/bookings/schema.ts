import { z } from 'zod'

export const RATE_TYPES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const
export type RateTypeKey = (typeof RATE_TYPES)[number]

export const RATE_LABELS: Record<RateTypeKey, string> = {
  DAILY: 'Per day',
  WEEKLY: 'Per week',
  MONTHLY: 'Per month',
}

/** Days covered by one unit of each rate. */
export const RATE_DAYS: Record<RateTypeKey, number> = { DAILY: 1, WEEKLY: 7, MONTHLY: 30 }

const dateTime = z
  .string()
  .trim()
  .min(1, 'Pick a date and time')
  // <input type="datetime-local"> gives "2026-09-25T10:00" in the browser's own zone.
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'That is not a valid date and time')
  .transform((v) => new Date(v))

export const bookingWindowSchema = z
  .object({
    startAt: dateTime,
    endAt: dateTime,
  })
  .refine((v) => v.endAt > v.startAt, {
    message: 'The return must be after the pick-up',
    path: ['endAt'],
  })

export const createBookingSchema = bookingWindowSchema.safeExtend({
  vehicleId: z.string().min(1, 'Choose a vehicle'),
  customerId: z.string().min(1, 'Choose a customer'),
  rateType: z.enum(RATE_TYPES),
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
})

export type CreateBookingInput = z.infer<typeof createBookingSchema>

/**
 * Rental pricing. A part-used period is charged in full, which is how rental desks
 * actually bill, and a booking is never less than one unit.
 */
export function quote(params: {
  startAt: Date
  endAt: Date
  rateType: RateTypeKey
  ratePerUnit: string
}) {
  const ms = params.endAt.getTime() - params.startAt.getTime()
  const days = ms / 86_400_000
  const perUnit = RATE_DAYS[params.rateType]
  const units = Math.max(1, Math.ceil(days / perUnit - 1e-9))

  // Money in paise, so 3 x 1500.50 cannot drift the way floats do.
  const paise = Math.round(Number(params.ratePerUnit) * 100) * units
  return { units, total: (paise / 100).toFixed(2) }
}

const fuelLevel = z.coerce
  .number()
  .int('Fuel level must be a whole percentage')
  .min(0, 'Fuel level cannot be below 0%')
  .max(100, 'Fuel level cannot be above 100%')

const odometer = z.coerce
  .number()
  .int('Odometer must be a whole number')
  .min(0, 'Odometer cannot be negative')
  .max(10_000_000, 'That odometer reading looks wrong')

export const checkOutSchema = z.object({
  odometer,
  fuelLevel,
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
})

export const checkInSchema = z.object({
  odometer,
  fuelLevel,
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
  damageNotes: z.string().trim().max(1000).optional().transform((v) => v || null),
})

export type CheckOutInput = z.infer<typeof checkOutSchema>
export type CheckInInput = z.infer<typeof checkInSchema>

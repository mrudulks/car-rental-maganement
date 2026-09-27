import { z } from 'zod'

export const SERVICE_STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const
export const SERVICE_STATUS_LABELS = {
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Done',
  CANCELLED: 'Cancelled',
} as const

const dateTime = z
  .string()
  .trim()
  .min(1, 'Pick a date and time')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'That is not a valid date and time')
  .transform((v) => new Date(v))

export const serviceSchema = z
  .object({
    vehicleId: z.string().min(1, 'Choose a vehicle'),
    reason: z.string().trim().min(2, 'Say what the work is').max(120),
    notes: z.string().trim().max(500).optional().transform((v) => v || null),
    startAt: dateTime,
    endAt: dateTime,
  })
  .refine((v) => v.endAt > v.startAt, {
    message: 'It has to come back out after it goes in',
    path: ['endAt'],
  })

export type ServiceInput = z.infer<typeof serviceSchema>

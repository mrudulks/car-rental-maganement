import { z } from 'zod'

export const customerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the customer name').max(80),
  phone: z
    .string()
    .trim()
    .min(6, 'Enter a phone number')
    .max(20, 'That phone number is too long'),
  email: z
    .union([z.email('Enter a valid email address'), z.literal('')])
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  licenceNumber: z.string().trim().max(40).optional().transform((v) => v || null),
  address: z.string().trim().max(200).optional().transform((v) => v || null),
})

export type CustomerInput = z.infer<typeof customerSchema>

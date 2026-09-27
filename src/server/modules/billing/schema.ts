import { z } from 'zod'

export const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'OTHER'] as const
export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  OTHER: 'Other',
}

export const PAYMENT_KINDS = ['RENTAL', 'DEPOSIT', 'DEPOSIT_REFUND', 'REFUND'] as const
export const PAYMENT_KIND_LABELS: Record<(typeof PAYMENT_KINDS)[number], string> = {
  RENTAL: 'Rental payment',
  DEPOSIT: 'Security deposit',
  DEPOSIT_REFUND: 'Deposit returned',
  REFUND: 'Refund',
}

export const CHARGE_KINDS = ['RENTAL', 'EXTRA', 'LATE_FEE', 'DAMAGE'] as const
export const CHARGE_KIND_LABELS: Record<(typeof CHARGE_KINDS)[number], string> = {
  RENTAL: 'Rental',
  EXTRA: 'Extra',
  LATE_FEE: 'Late fee',
  DAMAGE: 'Damage',
}

const money = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, 'Enter an amount like 1500 or 1500.50')
  .refine((v) => Number(v) > 0, 'Enter an amount greater than zero')

export const chargeSchema = z.object({
  kind: z.enum(['EXTRA', 'LATE_FEE', 'DAMAGE']),
  description: z.string().trim().min(2, 'Say what this is for').max(120),
  quantity: z.coerce.number().positive('Quantity must be more than zero').max(1000).default(1),
  unitAmount: money,
  taxable: z.coerce.boolean().default(true),
})

export const paymentSchema = z.object({
  kind: z.enum(PAYMENT_KINDS),
  amount: money,
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(60).optional().transform((v) => v || null),
  notes: z.string().trim().max(200).optional().transform((v) => v || null),
})

/** India's GST state codes are two digits; a GSTIN is 15 characters. */
export const gstSettingsSchema = z.object({
  legalName: z.string().trim().max(120).optional().transform((v) => v || null),
  gstin: z
    .union([
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/, 'That is not a valid 15-character GSTIN'),
      z.literal(''),
    ])
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  addressLine: z.string().trim().max(200).optional().transform((v) => v || null),
  city: z.string().trim().max(80).optional().transform((v) => v || null),
  state: z.string().trim().max(80).optional().transform((v) => v || null),
  stateCode: z
    .union([z.string().trim().regex(/^\d{2}$/, 'State code is two digits'), z.literal('')])
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  postalCode: z
    .union([z.string().trim().regex(/^\d{6}$/, 'Postal code is six digits'), z.literal('')])
    .transform((v) => (v === '' ? null : v))
    .nullable(),
  gstRate: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d{1,2})?$/, 'Enter a rate like 18 or 12.5')
    .refine((v) => Number(v) >= 0 && Number(v) <= 28, 'GST rate must be between 0 and 28'),
})

export type ChargeInput = z.infer<typeof chargeSchema>
export type PaymentInput = z.infer<typeof paymentSchema>
export type GstSettingsInput = z.infer<typeof gstSettingsSchema>

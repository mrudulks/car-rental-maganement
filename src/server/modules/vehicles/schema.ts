import { z } from 'zod'
import type { VehicleCategory } from '@/generated/prisma/enums'
import type { InputJsonObject } from '@/generated/prisma/internal/prismaNamespace'

/**
 * Category-specific fields.
 *
 * This table is the single source of truth: the Zod schema below is built from it and
 * the form renders from it, so a field cannot be validated but never shown, or shown
 * but never validated.
 */
export type AttrField =
  | { key: string; label: string; type: 'number'; min?: number; max?: number; suffix?: string }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'boolean' }

const FUEL: AttrField = {
  key: 'fuelType',
  label: 'Fuel',
  type: 'select',
  options: [
    { value: 'PETROL', label: 'Petrol' },
    { value: 'DIESEL', label: 'Diesel' },
    { value: 'CNG', label: 'CNG' },
    { value: 'ELECTRIC', label: 'Electric' },
    { value: 'HYBRID', label: 'Hybrid' },
  ],
}

const TRANSMISSION: AttrField = {
  key: 'transmission',
  label: 'Transmission',
  type: 'select',
  options: [
    { value: 'MANUAL', label: 'Manual' },
    { value: 'AUTOMATIC', label: 'Automatic' },
  ],
}

const SEATS: AttrField = { key: 'seats', label: 'Seats', type: 'number', min: 1, max: 60 }
const ENGINE: AttrField = { key: 'engineCc', label: 'Engine', type: 'number', min: 30, max: 3000, suffix: 'cc' }
const LOAD: AttrField = { key: 'loadCapacityKg', label: 'Load capacity', type: 'number', min: 1, max: 60000, suffix: 'kg' }
const AC: AttrField = { key: 'airConditioned', label: 'Air conditioned', type: 'boolean' }

export const CATEGORY_FIELDS: Record<VehicleCategory, AttrField[]> = {
  CAR: [SEATS, TRANSMISSION, FUEL, AC],
  VAN: [SEATS, TRANSMISSION, FUEL, LOAD, AC],
  TRUCK: [FUEL, LOAD],
  BIKE: [ENGINE, FUEL],
  SCOOTER: [ENGINE, FUEL],
  OTHER: [],
}

export const CATEGORY_LABELS: Record<VehicleCategory, string> = {
  CAR: 'Car',
  VAN: 'Van',
  TRUCK: 'Truck',
  BIKE: 'Motorcycle',
  SCOOTER: 'Scooter',
  OTHER: 'Other',
}

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as VehicleCategory[]

/** Build the attribute validator for one category. Every attribute is optional. */
export function attributesSchema(category: VehicleCategory) {
  const shape: Record<string, z.ZodTypeAny> = {}

  // A form always sends a value for a control it rendered, so an untouched select or a
  // cleared number arrives as "". That means "not set", not "invalid" -- and not 0.
  const blankToUndefined = (v: unknown) => (v === '' || v == null ? undefined : v)

  for (const field of CATEGORY_FIELDS[category]) {
    if (field.type === 'number') {
      shape[field.key] = z.preprocess(
        blankToUndefined,
        z.coerce.number().int().min(field.min ?? 0).max(field.max ?? 1_000_000).optional(),
      )
    } else if (field.type === 'select') {
      shape[field.key] = z.preprocess(
        blankToUndefined,
        z.enum(field.options.map((o) => o.value) as [string, ...string[]]).optional(),
      )
    } else {
      shape[field.key] = z.coerce.boolean().optional()
    }
  }

  // Anything not in the table for this category is dropped rather than stored.
  return z.object(shape).strip()
}

/** Plates are typed inconsistently; store one normalised form so lookups and the unique index agree. */
export function normaliseRegistration(value: string) {
  return value.toUpperCase().replace(/\s+/g, ' ').trim()
}

const money = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, 'Enter an amount like 1500 or 1500.50')

const optionalMoney = z
  .union([money, z.literal('')])
  .transform((v) => (v === '' ? null : v))
  .nullable()

const baseVehicle = z.object({
  category: z.enum(['CAR', 'VAN', 'TRUCK', 'BIKE', 'SCOOTER', 'OTHER']),
  registrationNumber: z
    .string()
    .trim()
    .min(3, 'Enter the registration number')
    .max(20, 'That registration number is too long')
    .transform(normaliseRegistration),
  make: z.string().trim().min(1, 'Enter the make').max(40),
  model: z.string().trim().min(1, 'Enter the model').max(40),
  year: z
    .union([z.coerce.number().int().min(1950).max(new Date().getFullYear() + 1), z.literal('')])
    .transform((v) => (v === '' ? null : (v as number)))
    .nullable(),
  color: z.string().trim().max(30).optional().transform((v) => v || null),
  odometer: z.coerce.number().int().min(0).max(10_000_000),
  dailyRate: money,
  weeklyRate: optionalMoney,
  monthlyRate: optionalMoney,
  depositAmount: money,
  notes: z.string().trim().max(500).optional().transform((v) => v || null),
})

/** Parse a whole vehicle form, validating attributes against the chosen category. */
export function parseVehicleForm(raw: Record<string, unknown>) {
  const base = baseVehicle.safeParse(raw)
  if (!base.success) return base

  const attrs = attributesSchema(base.data.category).safeParse(raw)
  if (!attrs.success) return attrs

  // Drop keys the person left blank so the stored object holds only real values.
  const attributes = Object.fromEntries(
    Object.entries(attrs.data).filter(([, v]) => v !== undefined),
  ) as InputJsonObject

  return {
    success: true as const,
    data: { ...base.data, attributes },
  }
}

export type VehicleInput = Extract<ReturnType<typeof parseVehicleForm>, { success: true }>['data']

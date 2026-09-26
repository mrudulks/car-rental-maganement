import 'server-only'
import type { VehicleCategory, VehicleStatus } from '@/generated/prisma/enums'
import type { AuthContext } from '@/server/auth/dal'
import { assertCan } from '@/server/auth/permissions'
import type { VehicleInput } from './schema'

export class VehicleError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}

/**
 * What the UI gets. Decimals become strings here: Prisma's Decimal cannot cross into a
 * client component, and money should not be rounded through a float on the way.
 */
export type VehicleDTO = {
  id: string
  category: VehicleCategory
  registrationNumber: string
  make: string
  model: string
  year: number | null
  color: string | null
  status: VehicleStatus
  odometer: number
  dailyRate: string
  weeklyRate: string | null
  monthlyRate: string | null
  depositAmount: string
  attributes: Record<string, unknown>
  notes: string | null
}

type VehicleRow = {
  id: string
  category: VehicleCategory
  registrationNumber: string
  make: string
  model: string
  year: number | null
  color: string | null
  status: VehicleStatus
  odometer: number
  dailyRate: unknown
  weeklyRate: unknown
  monthlyRate: unknown
  depositAmount: unknown
  attributes: unknown
  notes: string | null
}

const money = (v: unknown) => (v == null ? null : String(v))

function toDTO(v: VehicleRow): VehicleDTO {
  return {
    id: v.id,
    category: v.category,
    registrationNumber: v.registrationNumber,
    make: v.make,
    model: v.model,
    year: v.year,
    color: v.color,
    status: v.status,
    odometer: v.odometer,
    dailyRate: money(v.dailyRate)!,
    weeklyRate: money(v.weeklyRate),
    monthlyRate: money(v.monthlyRate),
    depositAmount: money(v.depositAmount)!,
    attributes: (v.attributes ?? {}) as Record<string, unknown>,
    notes: v.notes,
  }
}

const SELECT = {
  id: true,
  category: true,
  registrationNumber: true,
  make: true,
  model: true,
  year: true,
  color: true,
  status: true,
  odometer: true,
  dailyRate: true,
  weeklyRate: true,
  monthlyRate: true,
  depositAmount: true,
  attributes: true,
  notes: true,
} as const

export type ListFilters = {
  status?: VehicleStatus
  category?: VehicleCategory
  search?: string
  page?: number
}

export const PAGE_SIZE = 25

export async function listVehicles(auth: AuthContext, filters: ListFilters = {}) {
  assertCan(auth.user.role, 'vehicle:read')

  const search = filters.search?.trim()
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(search
      ? {
          OR: [
            { registrationNumber: { contains: search, mode: 'insensitive' as const } },
            { make: { contains: search, mode: 'insensitive' as const } },
            { model: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const page = Math.max(1, filters.page ?? 1)

  const [rows, total] = await Promise.all([
    auth.db.vehicle.findMany({
      where,
      select: SELECT,
      // Retired vehicles sink to the bottom; the rest read like a board.
      orderBy: [{ status: 'asc' }, { registrationNumber: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    auth.db.vehicle.count({ where }),
  ])

  return {
    vehicles: rows.map(toDTO),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

export async function getVehicle(auth: AuthContext, id: string): Promise<VehicleDTO | null> {
  assertCan(auth.user.role, 'vehicle:read')
  const row = await auth.db.vehicle.findUnique({ where: { id }, select: SELECT })
  return row ? toDTO(row) : null
}

/** Rates are a commercial decision, so changing them needs more than vehicle:write. */
const RATE_FIELDS = ['dailyRate', 'weeklyRate', 'monthlyRate', 'depositAmount'] as const

export async function createVehicle(auth: AuthContext, input: VehicleInput): Promise<VehicleDTO> {
  assertCan(auth.user.role, 'vehicle:write')
  assertCan(auth.user.role, 'vehicle:setRates')

  const branchId = auth.user.branchId ?? (await defaultBranchId(auth))

  try {
    const row = await auth.db.vehicle.create({
      data: {
        organizationId: auth.organization.id,
        branchId,
        category: input.category,
        registrationNumber: input.registrationNumber,
        make: input.make,
        model: input.model,
        year: input.year,
        color: input.color,
        odometer: input.odometer,
        dailyRate: input.dailyRate,
        weeklyRate: input.weeklyRate,
        monthlyRate: input.monthlyRate,
        depositAmount: input.depositAmount,
        attributes: input.attributes,
        notes: input.notes,
      },
      select: SELECT,
    })
    return toDTO(row)
  } catch (error) {
    throw asFriendlyError(error, input.registrationNumber)
  }
}

export async function updateVehicle(
  auth: AuthContext,
  id: string,
  input: VehicleInput,
): Promise<VehicleDTO> {
  assertCan(auth.user.role, 'vehicle:write')

  const current = await auth.db.vehicle.findUnique({ where: { id }, select: SELECT })
  if (!current) throw new VehicleError('That vehicle is no longer in your fleet')

  const ratesChanged = RATE_FIELDS.some((f) => money(current[f]) !== (input[f] ?? null))
  if (ratesChanged) assertCan(auth.user.role, 'vehicle:setRates')

  try {
    const row = await auth.db.vehicle.update({
      where: { id },
      data: {
        category: input.category,
        registrationNumber: input.registrationNumber,
        make: input.make,
        model: input.model,
        year: input.year,
        color: input.color,
        odometer: input.odometer,
        dailyRate: input.dailyRate,
        weeklyRate: input.weeklyRate,
        monthlyRate: input.monthlyRate,
        depositAmount: input.depositAmount,
        attributes: input.attributes,
        notes: input.notes,
      },
      select: SELECT,
    })
    return toDTO(row)
  } catch (error) {
    throw asFriendlyError(error, input.registrationNumber)
  }
}

/**
 * Only the two states a person controls. RENTED is set by checking a booking out, so
 * letting someone pick it here would let the board lie about where a vehicle is.
 */
export async function setVehicleStatus(
  auth: AuthContext,
  id: string,
  status: 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED',
) {
  assertCan(auth.user.role, 'vehicle:write')
  if (status === 'RETIRED') assertCan(auth.user.role, 'vehicle:delete')

  const current = await auth.db.vehicle.findUnique({ where: { id }, select: { status: true } })
  if (!current) throw new VehicleError('That vehicle is no longer in your fleet')

  if (current.status === 'RENTED') {
    throw new VehicleError('This vehicle is out on rent. Check it in before changing its status.')
  }

  await auth.db.vehicle.update({ where: { id }, data: { status } })
}

/**
 * Deleting is only allowed while a vehicle has no history. Once it has been rented, the
 * booking record has to keep pointing at a real vehicle, so retiring is the way out.
 */
export async function deleteVehicle(auth: AuthContext, id: string) {
  assertCan(auth.user.role, 'vehicle:delete')

  const bookings = await auth.db.booking.count({ where: { vehicleId: id } })
  if (bookings > 0) {
    throw new VehicleError(
      'This vehicle has bookings on record, so it cannot be deleted. Retire it instead to take it off the board.',
    )
  }

  const deleted = await auth.db.vehicle.deleteMany({ where: { id } })
  if (deleted.count === 0) throw new VehicleError('That vehicle is no longer in your fleet')
}

async function defaultBranchId(auth: AuthContext) {
  const branch = await auth.db.branch.findFirst({
    where: { isDefault: true },
    select: { id: true },
  })
  if (!branch) throw new VehicleError('This organization has no branch to add vehicles to')
  return branch.id
}

function asFriendlyError(error: unknown, registration: string) {
  // P2002: the (organizationId, registrationNumber) unique index.
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
    return new VehicleError(`${registration} is already in your fleet`, 'registrationNumber')
  }
  return error
}

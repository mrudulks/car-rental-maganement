import 'server-only'
import type { BookingStatus } from '@/generated/prisma/enums'
import type { AuthContext } from '@/server/auth/dal'
import { assertCan } from '@/server/auth/permissions'
import { prisma } from '@/server/db/client'
import {
  quote,
  RATE_DAYS,
  type CheckInInput,
  type CheckOutInput,
  type CreateBookingInput,
  type RateTypeKey,
} from './schema'

export class BookingError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}

/** Statuses that hold a vehicle. Matches the WHERE clause of the booking_no_overlap constraint. */
const BLOCKING: BookingStatus[] = ['RESERVED', 'ACTIVE']

export type BookingDTO = {
  id: string
  bookingNumber: string
  status: BookingStatus
  startAt: Date
  endAt: Date
  actualStartAt: Date | null
  actualEndAt: Date | null
  rateType: RateTypeKey
  ratePerUnit: string
  estimatedTotal: string
  depositAmount: string
  notes: string | null
  checkoutOdometer: number | null
  checkoutFuelLevel: number | null
  checkoutNotes: string | null
  checkinOdometer: number | null
  checkinFuelLevel: number | null
  checkinNotes: string | null
  damageNotes: string | null
  vehicle: { id: string; registrationNumber: string; make: string; model: string }
  customer: { id: string; fullName: string; phone: string }
}

const SELECT = {
  id: true,
  bookingNumber: true,
  status: true,
  startAt: true,
  endAt: true,
  actualStartAt: true,
  actualEndAt: true,
  rateType: true,
  ratePerUnit: true,
  estimatedTotal: true,
  depositAmount: true,
  notes: true,
  checkoutOdometer: true,
  checkoutFuelLevel: true,
  checkoutNotes: true,
  checkinOdometer: true,
  checkinFuelLevel: true,
  checkinNotes: true,
  damageNotes: true,
  vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
  customer: { select: { id: true, fullName: true, phone: true } },
} as const

type Row = {
  ratePerUnit: unknown
  estimatedTotal: unknown
  depositAmount: unknown
  [k: string]: unknown
}

function toDTO(b: Row): BookingDTO {
  return {
    ...(b as unknown as Omit<BookingDTO, 'ratePerUnit' | 'estimatedTotal' | 'depositAmount'>),
    ratePerUnit: String(b.ratePerUnit),
    estimatedTotal: String(b.estimatedTotal),
    depositAmount: String(b.depositAmount),
  }
}

/**
 * Vehicles that can be rented for a window.
 *
 * Availability is decided by overlapping bookings, not by the vehicle's current status:
 * a car out on rent today is still bookable for next month. Only vehicles off the road
 * entirely -- in service or retired -- are excluded outright.
 */
export async function findAvailableVehicles(
  auth: AuthContext,
  window: { startAt: Date; endAt: Date },
) {
  assertCan(auth.user.role, 'vehicle:read')

  const rows = await auth.db.vehicle.findMany({
    where: {
      status: { in: ['AVAILABLE', 'RENTED'] },
      bookings: {
        none: {
          status: { in: BLOCKING },
          // Half-open overlap, matching the database constraint exactly.
          startAt: { lt: window.endAt },
          endAt: { gt: window.startAt },
        },
      },
    },
    select: {
      id: true,
      registrationNumber: true,
      make: true,
      model: true,
      category: true,
      status: true,
      dailyRate: true,
      weeklyRate: true,
      monthlyRate: true,
      depositAmount: true,
    },
    orderBy: [{ category: 'asc' }, { registrationNumber: 'asc' }],
  })

  return rows.map((v) => ({
    ...v,
    dailyRate: String(v.dailyRate),
    weeklyRate: v.weeklyRate == null ? null : String(v.weeklyRate),
    monthlyRate: v.monthlyRate == null ? null : String(v.monthlyRate),
    depositAmount: String(v.depositAmount),
  }))
}

export type AvailableVehicle = Awaited<ReturnType<typeof findAvailableVehicles>>[number]

function rateFor(
  vehicle: { dailyRate: unknown; weeklyRate: unknown; monthlyRate: unknown },
  rateType: RateTypeKey,
) {
  const raw =
    rateType === 'WEEKLY'
      ? vehicle.weeklyRate
      : rateType === 'MONTHLY'
        ? vehicle.monthlyRate
        : vehicle.dailyRate
  return raw == null ? null : String(raw)
}

export async function createBooking(
  auth: AuthContext,
  input: CreateBookingInput,
): Promise<BookingDTO> {
  assertCan(auth.user.role, 'booking:write')

  if (input.endAt <= input.startAt) {
    throw new BookingError('The return must be after the pick-up', 'endAt')
  }

  const vehicle = await auth.db.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: {
      id: true,
      status: true,
      dailyRate: true,
      weeklyRate: true,
      monthlyRate: true,
      depositAmount: true,
    },
  })
  if (!vehicle) throw new BookingError('That vehicle is not in your fleet', 'vehicleId')
  if (vehicle.status === 'MAINTENANCE' || vehicle.status === 'RETIRED') {
    throw new BookingError('That vehicle is off the road and cannot be booked', 'vehicleId')
  }

  const customer = await auth.db.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true },
  })
  if (!customer) throw new BookingError('That customer is not on your list', 'customerId')

  const ratePerUnit = rateFor(vehicle, input.rateType)
  if (ratePerUnit == null) {
    throw new BookingError(
      `This vehicle has no ${input.rateType.toLowerCase()} rate. Choose another rate or set one on the vehicle.`,
      'rateType',
    )
  }

  const { total } = quote({
    startAt: input.startAt,
    endAt: input.endAt,
    rateType: input.rateType,
    ratePerUnit,
  })

  try {
    const created = await prisma.$transaction(async (tx) => {
      // Atomic per-tenant counter: two people booking at once get different numbers.
      const org = await tx.organization.update({
        where: { id: auth.organization.id },
        data: { bookingSeq: { increment: 1 } },
        select: { bookingSeq: true },
      })

      return tx.booking.create({
        data: {
          organizationId: auth.organization.id,
          branchId: auth.user.branchId ?? (await defaultBranchId(auth)),
          vehicleId: vehicle.id,
          customerId: customer.id,
          bookingNumber: `BK-${String(org.bookingSeq).padStart(4, '0')}`,
          status: 'RESERVED',
          startAt: input.startAt,
          endAt: input.endAt,
          rateType: input.rateType,
          ratePerUnit,
          estimatedTotal: total,
          depositAmount: String(vehicle.depositAmount),
          notes: input.notes,
          createdByUserId: auth.user.id,
        },
        select: SELECT,
      })
    })

    return toDTO(created)
  } catch (error) {
    throw asFriendlyError(error)
  }
}

export type ListFilters = { status?: BookingStatus; search?: string; page?: number }
export const PAGE_SIZE = 25

export async function listBookings(auth: AuthContext, filters: ListFilters = {}) {
  assertCan(auth.user.role, 'booking:read')

  const search = filters.search?.trim()
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(search
      ? {
          OR: [
            { bookingNumber: { contains: search, mode: 'insensitive' as const } },
            { customer: { fullName: { contains: search, mode: 'insensitive' as const } } },
            { customer: { phone: { contains: search } } },
            { vehicle: { registrationNumber: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  }

  const page = Math.max(1, filters.page ?? 1)
  const [rows, total] = await Promise.all([
    auth.db.booking.findMany({
      where,
      select: SELECT,
      orderBy: [{ startAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    auth.db.booking.count({ where }),
  ])

  return {
    bookings: rows.map(toDTO),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

export async function getBooking(auth: AuthContext, id: string): Promise<BookingDTO | null> {
  assertCan(auth.user.role, 'booking:read')
  const row = await auth.db.booking.findUnique({ where: { id }, select: SELECT })
  return row ? toDTO(row) : null
}

export async function cancelBooking(auth: AuthContext, id: string) {
  assertCan(auth.user.role, 'booking:cancel')

  const booking = await auth.db.booking.findUnique({ where: { id }, select: { status: true } })
  if (!booking) throw new BookingError('That booking is no longer on your list')

  if (booking.status !== 'RESERVED') {
    throw new BookingError(
      booking.status === 'ACTIVE'
        ? 'This rental is already out. Check it in instead of cancelling.'
        : `A ${booking.status.toLowerCase()} booking cannot be cancelled.`,
    )
  }

  await auth.db.booking.update({ where: { id }, data: { status: 'CANCELLED' } })
}

async function defaultBranchId(auth: AuthContext) {
  const branch = await auth.db.branch.findFirst({ where: { isDefault: true }, select: { id: true } })
  if (!branch) throw new BookingError('This organization has no branch to book against')
  return branch.id
}

/**
 * The no-overlap exclusion constraint is the real guard against double-booking, so its
 * violation has to read as an ordinary, explainable outcome rather than a crash.
 */
function asFriendlyError(error: unknown) {
  const text = error instanceof Error ? `${error.message}` : String(error)
  const code = (error as { code?: string })?.code

  if (code === '23P01' || text.includes('booking_no_overlap') || text.includes('exclusion')) {
    return new BookingError(
      'That vehicle is already booked for part of those dates. Pick different dates or another vehicle.',
      'vehicleId',
    )
  }
  return error
}

export { quote, RATE_DAYS }

/**
 * Handing the keys over. Moves the booking RESERVED -> ACTIVE and the vehicle to RENTED
 * in one transaction, so the board can never show a vehicle as free while it is out.
 */
export async function checkOut(
  auth: AuthContext,
  id: string,
  input: CheckOutInput,
): Promise<BookingDTO> {
  assertCan(auth.user.role, 'booking:write')

  const booking = await auth.db.booking.findUnique({
    where: { id },
    select: { id: true, status: true, vehicleId: true, vehicle: { select: { odometer: true } } },
  })
  if (!booking) throw new BookingError('That booking is no longer on your list')

  if (booking.status !== 'RESERVED') {
    throw new BookingError(
      booking.status === 'ACTIVE'
        ? 'This rental is already out.'
        : `A ${booking.status.toLowerCase()} booking cannot be checked out.`,
    )
  }

  if (input.odometer < booking.vehicle.odometer) {
    throw new BookingError(
      `The odometer cannot go backwards. It last read ${booking.vehicle.odometer.toLocaleString('en-IN')} km.`,
      'odometer',
    )
  }

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: 'ACTIVE',
        actualStartAt: new Date(),
        checkoutOdometer: input.odometer,
        checkoutFuelLevel: input.fuelLevel,
        checkoutNotes: input.notes,
      },
      select: SELECT,
    })

    await tx.vehicle.update({
      where: { id: booking.vehicleId },
      data: { status: 'RENTED', odometer: input.odometer },
    })

    return b
  })

  return toDTO(updated)
}

/**
 * Taking the keys back. Moves ACTIVE -> COMPLETED, frees the vehicle and rolls its
 * odometer forward to what came back on the clock.
 */
export async function checkIn(
  auth: AuthContext,
  id: string,
  input: CheckInInput,
): Promise<BookingDTO> {
  assertCan(auth.user.role, 'booking:write')

  const booking = await auth.db.booking.findUnique({
    where: { id },
    select: { id: true, status: true, vehicleId: true, checkoutOdometer: true },
  })
  if (!booking) throw new BookingError('That booking is no longer on your list')

  if (booking.status !== 'ACTIVE') {
    throw new BookingError(
      booking.status === 'RESERVED'
        ? 'This rental has not gone out yet. Check it out first.'
        : `A ${booking.status.toLowerCase()} booking cannot be checked in.`,
    )
  }

  if (booking.checkoutOdometer != null && input.odometer < booking.checkoutOdometer) {
    throw new BookingError(
      `The odometer cannot go backwards. It read ${booking.checkoutOdometer.toLocaleString('en-IN')} km when it went out.`,
      'odometer',
    )
  }

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: 'COMPLETED',
        actualEndAt: new Date(),
        checkinOdometer: input.odometer,
        checkinFuelLevel: input.fuelLevel,
        checkinNotes: input.notes,
        damageNotes: input.damageNotes,
      },
      select: SELECT,
    })

    await tx.vehicle.update({
      where: { id: booking.vehicleId },
      // Back on the board. Anything needing a workshop is sent to service separately,
      // so a return never silently hides a vehicle.
      data: { status: 'AVAILABLE', odometer: input.odometer },
    })

    return b
  })

  return toDTO(updated)
}

/** Kilometres covered on a completed rental, when both readings are on record. */
export function distanceCovered(booking: {
  checkoutOdometer: number | null
  checkinOdometer: number | null
}) {
  if (booking.checkoutOdometer == null || booking.checkinOdometer == null) return null
  return booking.checkinOdometer - booking.checkoutOdometer
}

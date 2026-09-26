import 'server-only'
import type { AuthContext } from '@/server/auth/dal'
import { assertCan } from '@/server/auth/permissions'

const BOOKING_FIELDS = {
  id: true,
  bookingNumber: true,
  status: true,
  startAt: true,
  endAt: true,
  vehicle: { select: { id: true, registrationNumber: true, make: true, model: true, category: true } },
  customer: { select: { id: true, fullName: true, phone: true } },
} as const

function dayBounds(now: Date) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

/**
 * What the counter has to deal with today, in the order it matters: anything already
 * late, then keys going out, then vehicles coming back. A count of vehicles does not
 * tell anyone what to do next; this does.
 */
export async function getTodayBoard(auth: AuthContext, now = new Date()) {
  assertCan(auth.user.role, 'booking:read')
  const { end } = dayBounds(now)

  const weekEnd = new Date(end)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const [overdue, goingOut, backToday, upcoming, fleet, vehicleCount] = await Promise.all([
    auth.db.booking.findMany({
      where: { status: 'ACTIVE', endAt: { lt: now } },
      select: BOOKING_FIELDS,
      orderBy: { endAt: 'asc' },
      take: 10,
    }),
    auth.db.booking.findMany({
      where: { status: 'RESERVED', startAt: { lt: end } },
      select: BOOKING_FIELDS,
      orderBy: { startAt: 'asc' },
      take: 10,
    }),
    auth.db.booking.findMany({
      where: { status: 'ACTIVE', endAt: { gte: now, lt: end } },
      select: BOOKING_FIELDS,
      orderBy: { endAt: 'asc' },
      take: 10,
    }),
    // So a quiet day still shows what is coming rather than an empty screen.
    auth.db.booking.findMany({
      where: { status: 'RESERVED', startAt: { gte: end, lt: weekEnd } },
      select: BOOKING_FIELDS,
      orderBy: { startAt: 'asc' },
      take: 6,
    }),
    auth.db.vehicle.groupBy({ by: ['status'], _count: { _all: true } }),
    auth.db.vehicle.count(),
  ])

  const count = (status: string) =>
    fleet.find((row) => row.status === status)?._count._all ?? 0

  const available = count('AVAILABLE')
  const rented = count('RENTED')
  const maintenance = count('MAINTENANCE')
  // Retired vehicles are off the books, so they do not count against utilisation.
  const working = available + rented + maintenance

  return {
    overdue,
    goingOut,
    backToday,
    upcoming,
    vehicleCount,
    fleet: {
      available,
      rented,
      maintenance,
      retired: count('RETIRED'),
      working,
      utilisation: working === 0 ? 0 : Math.round((rented / working) * 100),
    },
  }
}

export type TodayBoard = Awaited<ReturnType<typeof getTodayBoard>>
export type BoardBooking = TodayBoard['overdue'][number]

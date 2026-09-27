import 'server-only'
import type { AuthContext } from '@/server/auth/dal'
import { assertCan } from '@/server/auth/permissions'

export type TimelineBar = {
  id: string
  kind: 'BOOKING' | 'SERVICE'
  label: string
  detail: string
  href: string
  status: string
  startAt: Date
  endAt: Date
}

export type TimelineRow = {
  vehicle: {
    id: string
    registrationNumber: string
    make: string
    model: string
    category: string
    status: string
  }
  bars: TimelineBar[]
}

/** Midnight at the start of the given day, in the server's zone. */
export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * Everything taking a vehicle off the road across a window: rentals and workshop
 * slots side by side, because from a planning point of view they are the same thing.
 */
export async function getTimeline(
  auth: AuthContext,
  window: { from: Date; days: number },
): Promise<{ rows: TimelineRow[]; from: Date; to: Date; days: Date[] }> {
  assertCan(auth.user.role, 'booking:read')

  const from = startOfDay(window.from)
  const to = addDays(from, window.days)

  const vehicles = await auth.db.vehicle.findMany({
    where: { status: { not: 'RETIRED' } },
    select: {
      id: true,
      registrationNumber: true,
      make: true,
      model: true,
      category: true,
      status: true,
      bookings: {
        where: {
          status: { in: ['RESERVED', 'ACTIVE'] },
          startAt: { lt: to },
          endAt: { gt: from },
        },
        select: {
          id: true,
          bookingNumber: true,
          status: true,
          startAt: true,
          endAt: true,
          customer: { select: { fullName: true } },
        },
      },
      services: {
        where: { status: 'SCHEDULED', startAt: { lt: to }, endAt: { gt: from } },
        select: { id: true, reason: true, startAt: true, endAt: true },
      },
    },
    orderBy: [{ category: 'asc' }, { registrationNumber: 'asc' }],
  })

  const days: Date[] = Array.from({ length: window.days }, (_, i) => addDays(from, i))

  const rows: TimelineRow[] = vehicles.map((v) => ({
    vehicle: {
      id: v.id,
      registrationNumber: v.registrationNumber,
      make: v.make,
      model: v.model,
      category: v.category,
      status: v.status,
    },
    bars: [
      ...v.bookings.map(
        (b): TimelineBar => ({
          id: b.id,
          kind: 'BOOKING',
          label: b.bookingNumber,
          detail: b.customer.fullName,
          href: `/bookings/${b.id}`,
          status: b.status,
          startAt: b.startAt,
          endAt: b.endAt,
        }),
      ),
      ...v.services.map(
        (s): TimelineBar => ({
          id: s.id,
          kind: 'SERVICE',
          label: 'Workshop',
          detail: s.reason,
          href: `/calendar?service=${s.id}`,
          status: 'SCHEDULED',
          startAt: s.startAt,
          endAt: s.endAt,
        }),
      ),
    ].sort((a, b) => a.startAt.getTime() - b.startAt.getTime()),
  }))

  return { rows, from, to, days }
}

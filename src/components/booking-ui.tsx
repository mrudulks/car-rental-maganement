import type { BookingStatus } from '@/generated/prisma/enums'

export const BOOKING_STATUSES: BookingStatus[] = ['RESERVED', 'ACTIVE', 'COMPLETED', 'CANCELLED']

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  RESERVED: 'Reserved',
  ACTIVE: 'Out now',
  COMPLETED: 'Returned',
  CANCELLED: 'Cancelled',
}

const STYLES: Record<BookingStatus, string> = {
  RESERVED: 'text-ink bg-plate/25 border-plate-dark/40',
  ACTIVE: 'text-rented bg-rented/10 border-rented/25',
  COMPLETED: 'text-available bg-available/10 border-available/25',
  CANCELLED: 'text-muted bg-muted/10 border-muted/25',
}

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {BOOKING_STATUS_LABELS[status]}
    </span>
  )
}

/** Dates on screen are short: a rental desk reads "3 Jun, 10:00", not an ISO string. */
export function formatWhen(date: Date) {
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

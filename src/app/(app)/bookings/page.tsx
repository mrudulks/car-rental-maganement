import Link from 'next/link'
import { ArrowRight, CalendarPlus, Plus, Search, SlidersHorizontal, Ticket } from 'lucide-react'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { listBookings } from '@/server/modules/bookings/service'
import type { BookingStatus } from '@/generated/prisma/enums'
import { Plate, formatMoney } from '@/components/ui'
import { EmptyState, PageHeader, TableShell, Th, Tr } from '@/components/layout'
import {
  BOOKING_STATUSES,
  BOOKING_STATUS_LABELS,
  BookingStatusPill,
  formatWhen,
} from '@/components/booking-ui'

export const metadata = { title: 'Bookings — Fleetdesk' }

export default async function BookingsPage(props: PageProps<'/bookings'>) {
  const auth = await requireAuth()
  const sp = await props.searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

  const status = BOOKING_STATUSES.includes(one(sp.status) as BookingStatus)
    ? (one(sp.status) as BookingStatus)
    : undefined
  const search = one(sp.q) ?? ''
  const page = Number(one(sp.page) ?? '1') || 1

  const { bookings, total, pageCount } = await listBookings(auth, { status, search, page })
  const mayHandle = can(auth.user.role, 'booking:write')
  const filtering = Boolean(status || search)

  return (
    <div>
      <PageHeader
        title="Bookings"
        meta={`${total} ${total === 1 ? 'booking' : 'bookings'}${filtering ? ' matching' : ''}`}
        action={
          can(auth.user.role, 'booking:write') ? (
            <Link href="/bookings/new" className="btn-primary">
              <Plus className="size-4" strokeWidth={2} />
              New booking
            </Link>
          ) : null
        }
      />

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper p-3">
        <div className="w-full sm:w-auto sm:min-w-56 sm:flex-1">
          <label htmlFor="q" className="field-label">
            Search
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <input
              id="q"
              name="q"
              defaultValue={search}
              placeholder="Booking number, customer, phone or plate"
              className="field-control pl-9"
            />
          </div>
        </div>
        <div>
          <label htmlFor="status" className="field-label">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ''}
            className="field-control"
          >
            <option value="">Any</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {BOOKING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-quiet py-2">
          <SlidersHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Apply
        </button>
        {filtering ? (
          <Link href="/bookings" className="px-2 py-2 text-[15px] text-muted underline underline-offset-4">
            Clear
          </Link>
        ) : null}
      </form>

      {bookings.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Ticket className="size-5" strokeWidth={1.75} />}
            title={filtering ? 'No bookings match' : 'No bookings yet'}
            body={
              filtering
                ? 'Try a different search, or clear the filters.'
                : 'Reserve a vehicle for a customer and it will show up here.'
            }
            action={
              !filtering && can(auth.user.role, 'booking:write') ? (
                <Link href="/bookings/new" className="btn-primary">
                  <CalendarPlus className="size-4" strokeWidth={2} />
                  Take a booking
                </Link>
              ) : null
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-6">
            <TableShell>
              <thead>
                <tr>
                  <Th>Booking</Th>
                  <Th>Vehicle</Th>
                  <Th>Customer</Th>
                  <Th>Dates</Th>
                  <Th>Status</Th>
                  <Th align="right">Total</Th>
                  <Th align="right">
                    <span className="sr-only">Next step</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <Tr key={b.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/bookings/${b.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {b.bookingNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2.5">
                        <Plate>{b.vehicle.registrationNumber}</Plate>
                        <span className="whitespace-nowrap text-muted">
                          {b.vehicle.make} {b.vehicle.model}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {b.customer.fullName}
                      <span className="ml-2 text-sm text-muted">{b.customer.phone}</span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {formatWhen(b.startAt)} → {formatWhen(b.endAt)}
                    </td>
                    <td className="px-4 py-3">
                      <BookingStatusPill status={b.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(b.estimatedTotal)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {mayHandle && b.status === 'RESERVED' ? (
                        <Link
                          href={`/bookings/${b.id}/check-out`}
                          className="btn-quiet"
                        >
                          Hand over
                          <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden="true" />
                        </Link>
                      ) : null}
                      {mayHandle && b.status === 'ACTIVE' ? (
                        <Link
                          href={`/bookings/${b.id}/check-in`}
                          className="btn-quiet"
                        >
                          Take back
                          <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden="true" />
                        </Link>
                      ) : null}
                    </td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>
          </div>

          {pageCount > 1 ? (
            <nav className="mt-4 flex items-center justify-between text-[15px]" aria-label="Pages">
              <span className="text-muted">
                Page {page} of {pageCount}
              </span>
            </nav>
          ) : null}
        </>
      )}
    </div>
  )
}

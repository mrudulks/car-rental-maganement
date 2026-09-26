import Link from 'next/link'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { listBookings } from '@/server/modules/bookings/service'
import type { BookingStatus } from '@/generated/prisma/enums'
import { Plate, formatMoney } from '@/components/ui'
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="mt-1 text-[15px] text-muted">
            {total} {total === 1 ? 'booking' : 'bookings'}
            {filtering ? ' matching' : ''}
          </p>
        </div>
        {can(auth.user.role, 'booking:write') ? (
          <Link
            href="/bookings/new"
            className="rounded-md bg-plate px-4 py-2 text-[15px] font-semibold text-ink hover:bg-plate-dark"
          >
            New booking
          </Link>
        ) : null}
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-auto sm:min-w-56 sm:flex-1">
          <label htmlFor="q" className="mb-1.5 block text-sm font-medium text-ink">
            Search
          </label>
          <input
            id="q"
            name="q"
            defaultValue={search}
            placeholder="Booking number, customer, phone or plate"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[15px]"
          />
        </div>
        <div>
          <label htmlFor="status" className="mb-1.5 block text-sm font-medium text-ink">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ''}
            className="rounded-md border border-line bg-paper px-3 py-2 text-[15px]"
          >
            <option value="">Any</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {BOOKING_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md border border-line bg-paper px-4 py-2 text-[15px] font-medium hover:bg-wash"
        >
          Apply
        </button>
        {filtering ? (
          <Link href="/bookings" className="px-2 py-2 text-[15px] text-muted underline underline-offset-4">
            Clear
          </Link>
        ) : null}
      </form>

      {bookings.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line bg-paper px-6 py-12 text-center">
          <h2 className="text-lg font-semibold tracking-tight">
            {filtering ? 'No bookings match' : 'No bookings yet'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-muted">
            {filtering
              ? 'Try a different search, or clear the filters.'
              : 'Reserve a vehicle for a customer and it will show up here.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 relative overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full min-w-[46rem] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Booking</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Vehicle</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Customer</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Dates</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
                  <th scope="col" className="px-4 py-2.5">
                    <span className="sr-only">Next step</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/bookings/${b.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {b.bookingNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Plate>{b.vehicle.registrationNumber}</Plate>
                      <span className="ml-2.5 whitespace-nowrap text-muted">
                        {b.vehicle.make} {b.vehicle.model}
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
                    <td className="px-4 py-3 text-right">{formatMoney(b.estimatedTotal)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {mayHandle && b.status === 'RESERVED' ? (
                        <Link
                          href={`/bookings/${b.id}/check-out`}
                          className="rounded-md border border-line px-2.5 py-1 text-sm hover:bg-wash"
                        >
                          Hand over
                        </Link>
                      ) : null}
                      {mayHandle && b.status === 'ACTIVE' ? (
                        <Link
                          href={`/bookings/${b.id}/check-in`}
                          className="rounded-md border border-line px-2.5 py-1 text-sm hover:bg-wash"
                        >
                          Take back
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

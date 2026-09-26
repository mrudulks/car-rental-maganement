import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { getBooking, distanceCovered } from '@/server/modules/bookings/service'
import { RATE_LABELS } from '@/server/modules/bookings/schema'
import { Plate, formatMoney } from '@/components/ui'
import { BookingStatusPill, formatWhen } from '@/components/booking-ui'
import { CancelBooking } from './cancel-booking'

export const metadata = { title: 'Booking — Fleetdesk' }

export default async function BookingPage(props: PageProps<'/bookings/[id]'>) {
  const { id } = await props.params
  const auth = await requireAuth()
  const booking = await getBooking(auth, id)
  if (!booking) notFound()

  return (
    <div className="max-w-2xl">
      <Link href="/bookings" className="text-[15px] text-muted underline underline-offset-4">
        Bookings
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{booking.bookingNumber}</h1>
        <BookingStatusPill status={booking.status} />
      </div>

      <dl className="mt-8 divide-y divide-line overflow-hidden rounded-lg border border-line bg-paper">
        <Row label="Vehicle">
          <Link href={`/fleet/${booking.vehicle.id}`} className="inline-flex items-center gap-2.5">
            <Plate>{booking.vehicle.registrationNumber}</Plate>
            <span className="underline-offset-4 hover:underline">
              {booking.vehicle.make} {booking.vehicle.model}
            </span>
          </Link>
        </Row>
        <Row label="Customer">
          {booking.customer.fullName}
          <span className="ml-2 text-muted">{booking.customer.phone}</span>
        </Row>
        <Row label="Pick-up">{formatWhen(booking.startAt)}</Row>
        <Row label="Return">{formatWhen(booking.endAt)}</Row>
        <Row label="Rate">
          {formatMoney(booking.ratePerUnit)} {RATE_LABELS[booking.rateType].toLowerCase()}
        </Row>
        <Row label="Estimated total">{formatMoney(booking.estimatedTotal)}</Row>
        <Row label="Deposit">{formatMoney(booking.depositAmount)}</Row>
        {booking.notes ? <Row label="Notes">{booking.notes}</Row> : null}
      </dl>

      {booking.status === 'RESERVED' && can(auth.user.role, 'booking:write') ? (
        <NextStep
          href={`/bookings/${booking.id}/check-out`}
          title="Ready to go out"
          body="Record the odometer and fuel when you hand over the keys."
          label="Hand over keys"
        />
      ) : null}

      {booking.status === 'ACTIVE' && can(auth.user.role, 'booking:write') ? (
        <NextStep
          href={`/bookings/${booking.id}/check-in`}
          title={booking.endAt < new Date() ? 'Overdue' : 'Out on rent'}
          body={
            booking.endAt < new Date()
              ? `This was due back ${formatWhen(booking.endAt)}.`
              : `Due back ${formatWhen(booking.endAt)}.`
          }
          label="Take it back"
          urgent={booking.endAt < new Date()}
        />
      ) : null}

      {booking.checkoutOdometer != null ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">Hand-over record</h2>
          <dl className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-paper">
            <Row label="Out at">
              {booking.actualStartAt ? formatWhen(booking.actualStartAt) : '—'}
            </Row>
            <Row label="Odometer out">
              {booking.checkoutOdometer.toLocaleString('en-IN')} km
              {booking.checkoutFuelLevel != null ? ` · fuel ${booking.checkoutFuelLevel}%` : ''}
            </Row>
            {booking.checkoutNotes ? <Row label="Notes out">{booking.checkoutNotes}</Row> : null}
            {booking.checkinOdometer != null ? (
              <>
                <Row label="Back at">
                  {booking.actualEndAt ? formatWhen(booking.actualEndAt) : '—'}
                </Row>
                <Row label="Odometer in">
                  {booking.checkinOdometer.toLocaleString('en-IN')} km
                  {booking.checkinFuelLevel != null ? ` · fuel ${booking.checkinFuelLevel}%` : ''}
                </Row>
                <Row label="Distance">
                  {distanceCovered(booking)?.toLocaleString('en-IN')} km
                </Row>
                {booking.checkinNotes ? <Row label="Notes in">{booking.checkinNotes}</Row> : null}
                {booking.damageNotes ? (
                  <Row label="Damage">
                    <span className="text-rented">{booking.damageNotes}</span>
                  </Row>
                ) : null}
              </>
            ) : null}
          </dl>
        </section>
      ) : null}

      {booking.status === 'RESERVED' ? (
        <div className="mt-8 rounded-lg border border-line bg-paper p-5">
          <h2 className="font-semibold tracking-tight">Not going ahead?</h2>
          <p className="mt-1 text-[15px] text-muted">
            Cancelling frees the vehicle for those dates straight away.
          </p>
          {can(auth.user.role, 'booking:cancel') ? (
            <div className="mt-4">
              <CancelBooking bookingId={booking.id} />
            </div>
          ) : (
            <p className="mt-4 text-[15px] text-muted">
              Ask a manager or owner to cancel this booking.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function NextStep({
  href,
  title,
  body,
  label,
  urgent,
}: {
  href: string
  title: string
  body: string
  label: string
  urgent?: boolean
}) {
  return (
    <section
      className={`mt-8 rounded-lg border p-5 ${urgent ? 'border-rented/40 bg-rented/8' : 'border-line bg-paper'}`}
    >
      <h2 className="font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-[15px] text-muted">{body}</p>
      <Link
        href={href}
        className="mt-4 inline-block rounded-md bg-plate px-4 py-2 text-[15px] font-semibold text-ink hover:bg-plate-dark"
      >
        {label}
      </Link>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 px-4 py-3">
      <dt className="w-36 shrink-0 text-[15px] text-muted">{label}</dt>
      <dd className="text-[15px]">{children}</dd>
    </div>
  )
}

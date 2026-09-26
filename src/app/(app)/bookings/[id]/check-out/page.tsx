import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { getBooking } from '@/server/modules/bookings/service'
import { checkOutAction } from '@/app/actions/bookings'
import { NoAccess } from '@/components/no-access'
import { Plate } from '@/components/ui'
import { formatWhen } from '@/components/booking-ui'
import { HandoverForm } from '../handover-form'

export const metadata = { title: 'Hand over keys — Fleetdesk' }

export default async function CheckOutPage(props: PageProps<'/bookings/[id]/check-out'>) {
  const { id } = await props.params
  const auth = await requireAuth()

  if (!can(auth.user.role, 'booking:write')) {
    return <NoAccess what="hand over keys" role={auth.user.role} />
  }

  const booking = await getBooking(auth, id)
  if (!booking) notFound()

  // Nothing to do here unless the rental is still waiting to go out.
  if (booking.status !== 'RESERVED') redirect(`/bookings/${id}`)

  const vehicle = await auth.db.vehicle.findUniqueOrThrow({
    where: { id: booking.vehicle.id },
    select: { odometer: true },
  })

  const action = checkOutAction.bind(null, booking.id)

  return (
    <div className="max-w-2xl">
      <Link href={`/bookings/${booking.id}`} className="text-[15px] text-muted underline underline-offset-4">
        {booking.bookingNumber}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Hand over the keys</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-muted">
        <Plate>{booking.vehicle.registrationNumber}</Plate>
        {booking.vehicle.make} {booking.vehicle.model} · {booking.customer.fullName} · due back{' '}
        {formatWhen(booking.endAt)}
      </p>

      <HandoverForm
        action={action}
        mode="out"
        bookingId={booking.id}
        lastOdometer={vehicle.odometer}
        submitLabel="Hand over keys"
      />
    </div>
  )
}

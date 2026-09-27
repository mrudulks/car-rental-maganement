import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { getBooking } from '@/server/modules/bookings/service'
import { checkInAction } from '@/app/actions/bookings'
import { NoAccess } from '@/components/no-access'
import { Plate } from '@/components/ui'
import { formatWhen } from '@/components/booking-ui'
import { HandoverForm } from '../handover-form'
import { MediaCaptureCard } from '../media-capture'
import { listMedia, storageConfigured } from '@/server/modules/media/service'
import { MediaGallery } from '../media-gallery'

export const metadata = { title: 'Take the vehicle back — Fleetdesk' }

export default async function CheckInPage(props: PageProps<'/bookings/[id]/check-in'>) {
  const { id } = await props.params
  const auth = await requireAuth()

  if (!can(auth.user.role, 'booking:write')) {
    return <NoAccess what="take vehicles back" role={auth.user.role} />
  }

  const booking = await getBooking(auth, id)
  if (!booking) notFound()

  if (booking.status !== 'ACTIVE') redirect(`/bookings/${id}`)

  const action = checkInAction.bind(null, booking.id)
  const media = await listMedia(auth, booking.id)
  const overdue = booking.endAt < new Date()

  return (
    <div className="max-w-2xl">
      <Link href={`/bookings/${booking.id}`} className="text-[15px] text-muted underline underline-offset-4">
        {booking.bookingNumber}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Take the vehicle back</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-muted">
        <Plate>{booking.vehicle.registrationNumber}</Plate>
        {booking.vehicle.make} {booking.vehicle.model} · {booking.customer.fullName}
      </p>

      {overdue ? (
        <p className="mt-4 rounded-md border border-rented/30 bg-rented/8 px-3 py-2 text-[15px] text-rented">
          This was due back {formatWhen(booking.endAt)}.
        </p>
      ) : null}

      <div className="mt-8">
        <MediaCaptureCard
          bookingId={booking.id}
          phaseLabel="return"
          storageReady={storageConfigured()}
        />
      </div>

      <MediaGallery media={media} />

      <HandoverForm
        action={action}
        mode="in"
        bookingId={booking.id}
        lastOdometer={booking.checkoutOdometer ?? 0}
        submitLabel="Complete return"
      />
    </div>
  )
}

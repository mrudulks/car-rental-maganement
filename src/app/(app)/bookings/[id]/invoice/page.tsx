import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { getBooking } from '@/server/modules/bookings/service'
import { getBill } from '@/server/modules/billing/service'
import { getInvoiceForBooking } from '@/server/modules/billing/invoice'
import { NoAccess } from '@/components/no-access'
import { InvoiceDocument } from './invoice-document'

export const metadata = { title: 'Invoice — Fleetdesk' }

export default async function InvoicePage(props: PageProps<'/bookings/[id]/invoice'>) {
  const { id } = await props.params
  const auth = await requireAuth()

  if (!can(auth.user.role, 'payment:read')) {
    return <NoAccess what="see invoices" role={auth.user.role} />
  }

  const [booking, invoice] = await Promise.all([
    getBooking(auth, id),
    getInvoiceForBooking(auth, id),
  ])
  if (!booking) notFound()

  if (!invoice) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-line bg-paper px-6 py-12 text-center">
        <h1 className="text-lg font-semibold tracking-tight">No invoice yet</h1>
        <p className="mt-2 text-[15px] text-muted">
          Issue the invoice from the booking, then it can be printed or saved as a PDF.
        </p>
        <Link href={`/bookings/${id}`} className="mt-5 inline-block text-[15px] underline underline-offset-4">
          Back to {booking.bookingNumber}
        </Link>
      </div>
    )
  }

  const bill = await getBill(auth, id)

  return (
    <InvoiceDocument
      invoice={invoice}
      bookingNumber={booking.bookingNumber}
      bookingId={id}
      vehicle={`${booking.vehicle.registrationNumber} · ${booking.vehicle.make} ${booking.vehicle.model}`}
      paid={bill.paid}
      balance={bill.balance}
    />
  )
}

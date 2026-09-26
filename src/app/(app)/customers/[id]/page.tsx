import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { getCustomerWithHistory } from '@/server/modules/customers/service'
import { NoAccess } from '@/components/no-access'
import { Plate, formatMoney } from '@/components/ui'
import { BookingStatusPill, formatWhen } from '@/components/booking-ui'
import { CustomerForm } from './customer-form'

export const metadata = { title: 'Customer — Fleetdesk' }

export default async function CustomerPage(props: PageProps<'/customers/[id]'>) {
  const { id } = await props.params
  const auth = await requireAuth()

  if (!can(auth.user.role, 'customer:read')) {
    return <NoAccess what="see customers" role={auth.user.role} />
  }

  const customer = await getCustomerWithHistory(auth, id)
  if (!customer) notFound()

  const rentals = customer.bookings.length
  const onRent = customer.bookings.some((b) => b.status === 'ACTIVE')

  return (
    <div className="max-w-3xl">
      <Link href="/customers" className="text-[15px] text-muted underline underline-offset-4">
        Customers
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{customer.fullName}</h1>
        {onRent ? (
          <span className="inline-flex items-center rounded-full border border-rented/25 bg-rented/10 px-2 py-0.5 text-xs font-medium text-rented">
            Has a vehicle out
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[15px] text-muted">
        {customer.phone}
        {customer.licenceNumber ? ` · Licence ${customer.licenceNumber}` : ''} ·{' '}
        {rentals === 0 ? 'No rentals yet' : `${rentals} ${rentals === 1 ? 'rental' : 'rentals'}`}
      </p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Rental history</h2>
        {customer.bookings.length === 0 ? (
          <p className="mt-3 rounded-lg border border-line bg-paper px-4 py-6 text-[15px] text-muted">
            Nothing rented yet.
          </p>
        ) : (
          <div className="mt-3 relative overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full min-w-[46rem] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Booking</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Vehicle</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Dates</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {customer.bookings.map((b) => (
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
                    <td className="px-4 py-3 text-muted">
                      {formatWhen(b.startAt)} → {formatWhen(b.endAt)}
                    </td>
                    <td className="px-4 py-3">
                      <BookingStatusPill status={b.status} />
                    </td>
                    <td className="px-4 py-3 text-right">{formatMoney(b.estimatedTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {can(auth.user.role, 'customer:write') ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold tracking-tight">Details</h2>
          <div className="mt-3">
            <CustomerForm customer={customer} />
          </div>
        </section>
      ) : null}
    </div>
  )
}

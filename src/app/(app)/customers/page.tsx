import Link from 'next/link'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { listCustomers } from '@/server/modules/customers/service'
import { NoAccess } from '@/components/no-access'

export const metadata = { title: 'Customers — Fleetdesk' }

export default async function CustomersPage(props: PageProps<'/customers'>) {
  const auth = await requireAuth()
  if (!can(auth.user.role, 'customer:read')) {
    return <NoAccess what="see customers" role={auth.user.role} />
  }

  const sp = await props.searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const search = one(sp.q) ?? ''
  const page = Number(one(sp.page) ?? '1') || 1

  const { customers, total, pageCount } = await listCustomers(auth, { search, page })

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
        <p className="mt-1 text-[15px] text-muted">
          {total} {total === 1 ? 'customer' : 'customers'}
          {search ? ' matching' : ' on record'}
        </p>
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
            placeholder="Name, phone or licence number"
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[15px]"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-line bg-paper px-4 py-2 text-[15px] font-medium hover:bg-wash"
        >
          Search
        </button>
        {search ? (
          <Link href="/customers" className="px-2 py-2 text-[15px] text-muted underline underline-offset-4">
            Clear
          </Link>
        ) : null}
      </form>

      {customers.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line bg-paper px-6 py-12 text-center">
          <h2 className="text-lg font-semibold tracking-tight">
            {search ? 'No customers match' : 'No customers yet'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-muted">
            {search
              ? 'Try a different name, phone number or licence.'
              : 'Customers are added as you take bookings — there is nothing to fill in here first.'}
          </p>
          {!search && can(auth.user.role, 'booking:write') ? (
            <Link
              href="/bookings/new"
              className="mt-5 inline-block rounded-md bg-plate px-4 py-2 text-[15px] font-semibold text-ink hover:bg-plate-dark"
            >
              Take a booking
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-6 relative overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full min-w-[46rem] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Name</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Phone</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Licence</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Rentals</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Last rental</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/customers/${c.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {c.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{c.phone}</td>
                    <td className="px-4 py-3 text-muted">{c.licenceNumber ?? '—'}</td>
                    <td className="px-4 py-3 text-right">{c.bookingCount}</td>
                    <td className="px-4 py-3 text-muted">
                      {c.lastRentalAt
                        ? c.lastRentalAt.toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 ? (
            <p className="mt-4 text-[15px] text-muted">
              Page {page} of {pageCount}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

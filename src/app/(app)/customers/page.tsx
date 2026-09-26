import Link from 'next/link'
import { CalendarPlus, Search, Users } from 'lucide-react'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { listCustomers } from '@/server/modules/customers/service'
import { NoAccess } from '@/components/no-access'
import { EmptyState, PageHeader, TableShell, Th, Tr } from '@/components/layout'

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
      <PageHeader
        title="Customers"
        meta={`${total} ${total === 1 ? 'customer' : 'customers'}${search ? ' matching' : ' on record'}`}
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
              placeholder="Name, phone or licence number"
              className="field-control pl-9"
            />
          </div>
        </div>
        <button type="submit" className="btn-quiet py-2">
          <Search className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Search
        </button>
        {search ? (
          <Link href="/customers" className="px-2 py-2 text-[15px] text-muted underline underline-offset-4">
            Clear
          </Link>
        ) : null}
      </form>

      {customers.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Users className="size-5" strokeWidth={1.75} />}
            title={search ? 'No customers match' : 'No customers yet'}
            body={
              search
                ? 'Try a different name, phone number or licence.'
                : 'Customers are added as you take bookings — there is nothing to fill in here first.'
            }
            action={
              !search && can(auth.user.role, 'booking:write') ? (
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
                  <Th>Name</Th>
                  <Th>Phone</Th>
                  <Th>Licence</Th>
                  <Th align="right">Rentals</Th>
                  <Th>Last rental</Th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <Tr key={c.id}>
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
                    <td className="px-4 py-3 text-right tabular-nums">{c.bookingCount}</td>
                    <td className="px-4 py-3 text-muted">
                      {c.lastRentalAt
                        ? c.lastRentalAt.toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                  </Tr>
                ))}
              </tbody>
            </TableShell>
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

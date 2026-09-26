import Link from 'next/link'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { listVehicles } from '@/server/modules/vehicles/service'
import { CATEGORIES, CATEGORY_LABELS } from '@/server/modules/vehicles/schema'
import type { VehicleCategory, VehicleStatus } from '@/generated/prisma/enums'
import { Plate, StatusPill } from '@/components/ui'
import { VehicleRowActions } from './row-actions'

export const metadata = { title: 'Fleet — Fleetdesk' }

const STATUSES: VehicleStatus[] = ['AVAILABLE', 'RENTED', 'MAINTENANCE', 'RETIRED']

export default async function FleetPage(props: PageProps<'/fleet'>) {
  const auth = await requireAuth()
  const sp = await props.searchParams

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const status = STATUSES.includes(one(sp.status) as VehicleStatus)
    ? (one(sp.status) as VehicleStatus)
    : undefined
  const category = CATEGORIES.includes(one(sp.category) as VehicleCategory)
    ? (one(sp.category) as VehicleCategory)
    : undefined
  const search = one(sp.q) ?? ''
  const page = Number(one(sp.page) ?? '1') || 1

  const { vehicles, total, pageCount } = await listVehicles(auth, {
    status,
    category,
    search,
    page,
  })

  const mayAdd = can(auth.user.role, 'vehicle:setRates')
  const filtering = Boolean(status || category || search)

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fleet</h1>
          <p className="mt-1 text-[15px] text-muted">
            {total} {total === 1 ? 'vehicle' : 'vehicles'}
            {filtering ? ' matching' : ' in your fleet'}
          </p>
        </div>
        {mayAdd ? (
          <Link
            href="/fleet/new"
            className="rounded-md bg-plate px-4 py-2 text-[15px] font-semibold text-ink hover:bg-plate-dark"
          >
            Add a vehicle
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
            placeholder="Registration, make or model"
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
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'RENTED' ? 'On rent' : s === 'MAINTENANCE' ? 'In service' : s === 'AVAILABLE' ? 'Available' : 'Retired'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="category" className="mb-1.5 block text-sm font-medium text-ink">
            Type
          </label>
          <select
            id="category"
            name="category"
            defaultValue={category ?? ''}
            className="rounded-md border border-line bg-paper px-3 py-2 text-[15px]"
          >
            <option value="">Any</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
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
          <Link href="/fleet" className="px-2 py-2 text-[15px] text-muted underline underline-offset-4">
            Clear
          </Link>
        ) : null}
      </form>

      {vehicles.length === 0 ? (
        <EmptyState filtering={filtering} mayAdd={mayAdd} />
      ) : (
        <>
          <div className="mt-6 relative overflow-x-auto rounded-lg border border-line bg-paper">
            <table className="w-full min-w-[46rem] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Vehicle</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Per day</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Odometer</th>
                  <th scope="col" className="px-4 py-2.5">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/fleet/${v.id}`} className="inline-flex items-center gap-2.5">
                        <Plate>{v.registrationNumber}</Plate>
                        <span className="font-medium whitespace-nowrap underline-offset-4 hover:underline">
                          {v.make} {v.model}
                        </span>
                      </Link>
                      {v.year ? (
                        <span className="ml-2 whitespace-nowrap text-sm text-muted">{v.year}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted">{CATEGORY_LABELS[v.category]}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={v.status} />
                    </td>
                    <td className="px-4 py-3 text-right">₹{v.dailyRate}</td>
                    <td className="px-4 py-3 text-right text-muted">
                      {v.odometer.toLocaleString('en-IN')} km
                    </td>
                    <td className="px-4 py-3 text-right">
                      <VehicleRowActions
                        vehicle={v}
                        canRetire={can(auth.user.role, 'vehicle:delete')}
                      />
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
              <span className="flex gap-2">
                <PageLink sp={sp} page={page - 1} disabled={page <= 1}>
                  Previous
                </PageLink>
                <PageLink sp={sp} page={page + 1} disabled={page >= pageCount}>
                  Next
                </PageLink>
              </span>
            </nav>
          ) : null}
        </>
      )}
    </div>
  )
}

function PageLink({
  sp,
  page,
  disabled,
  children,
}: {
  sp: Record<string, string | string[] | undefined>
  page: number
  disabled: boolean
  children: React.ReactNode
}) {
  if (disabled) {
    return <span className="rounded-md border border-line px-3 py-1.5 text-muted/60">{children}</span>
  }
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && k !== 'page') params.set(k, v)
  }
  params.set('page', String(page))
  return (
    <Link
      href={`/fleet?${params}`}
      className="rounded-md border border-line bg-paper px-3 py-1.5 hover:bg-wash"
    >
      {children}
    </Link>
  )
}

function EmptyState({ filtering, mayAdd }: { filtering: boolean; mayAdd: boolean }) {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-line bg-paper px-6 py-12 text-center">
      <h2 className="text-lg font-semibold tracking-tight">
        {filtering ? 'No vehicles match those filters' : 'Add your first vehicle'}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-muted">
        {filtering
          ? 'Try a different search, or clear the filters to see the whole fleet.'
          : 'Once a vehicle is on the board you can take bookings against it and hand over keys.'}
      </p>
      {!filtering && mayAdd ? (
        <Link
          href="/fleet/new"
          className="mt-5 inline-block rounded-md bg-plate px-4 py-2 text-[15px] font-semibold text-ink hover:bg-plate-dark"
        >
          Add a vehicle
        </Link>
      ) : null}
      {filtering ? (
        <Link href="/fleet" className="mt-5 block text-[15px] underline underline-offset-4">
          Clear filters
        </Link>
      ) : null}
    </div>
  )
}

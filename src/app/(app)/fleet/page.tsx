import Link from 'next/link'
import { CarFront, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { listVehicles } from '@/server/modules/vehicles/service'
import { CATEGORIES, CATEGORY_LABELS } from '@/server/modules/vehicles/schema'
import type { VehicleCategory, VehicleStatus } from '@/generated/prisma/enums'
import { Plate, StatusPill, formatMoney } from '@/components/ui'
import { VehicleIcon } from '@/components/vehicle-icon'
import { EmptyState, PageHeader, TableShell, Th, Tr } from '@/components/layout'
import { VehicleRowActions } from './row-actions'

export const metadata = { title: 'Fleet — Fleetdesk' }

const STATUSES: VehicleStatus[] = ['AVAILABLE', 'RENTED', 'MAINTENANCE', 'RETIRED']
const STATUS_LABELS: Record<VehicleStatus, string> = {
  AVAILABLE: 'Available',
  RENTED: 'On rent',
  MAINTENANCE: 'In service',
  RETIRED: 'Retired',
}

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

  const { vehicles, total, pageCount } = await listVehicles(auth, { status, category, search, page })

  const mayAdd = can(auth.user.role, 'vehicle:setRates')
  const filtering = Boolean(status || category || search)

  return (
    <div>
      <PageHeader
        title="Fleet"
        meta={`${total} ${total === 1 ? 'vehicle' : 'vehicles'}${filtering ? ' matching' : ' in your fleet'}`}
        action={
          mayAdd ? (
            <Link href="/fleet/new" className="btn-primary">
              <Plus className="size-4" strokeWidth={2} />
              Add a vehicle
            </Link>
          ) : null
        }
      />

      <form
        method="get"
        className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-paper p-3"
      >
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
              placeholder="Registration, make or model"
              className="field-control pl-9"
            />
          </div>
        </div>
        <div>
          <label htmlFor="status" className="field-label">
            Status
          </label>
          <select id="status" name="status" defaultValue={status ?? ''} className="field-control">
            <option value="">Any</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="category" className="field-label">
            Type
          </label>
          <select id="category" name="category" defaultValue={category ?? ''} className="field-control">
            <option value="">Any</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-quiet py-2">
          <SlidersHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Apply
        </button>
        {filtering ? (
          <Link href="/fleet" className="px-2 py-2 text-[15px] text-muted underline underline-offset-4">
            Clear
          </Link>
        ) : null}
      </form>

      {vehicles.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<CarFront className="size-5" strokeWidth={1.75} />}
            title={filtering ? 'No vehicles match those filters' : 'Add your first vehicle'}
            body={
              filtering
                ? 'Try a different search, or clear the filters to see the whole fleet.'
                : 'Once a vehicle is on the board you can take bookings against it and hand over keys.'
            }
            action={
              filtering ? (
                <Link href="/fleet" className="btn-quiet py-2">
                  Clear filters
                </Link>
              ) : mayAdd ? (
                <Link href="/fleet/new" className="btn-primary">
                  <Plus className="size-4" strokeWidth={2} />
                  Add a vehicle
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
                  <Th>Vehicle</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th align="right">Per day</Th>
                  <Th align="right">Odometer</Th>
                  <Th align="right">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <Tr key={v.id}>
                    <td className="px-4 py-3">
                      <Link href={`/fleet/${v.id}`} className="inline-flex items-center gap-2.5">
                        <Plate>{v.registrationNumber}</Plate>
                        <span className="font-medium whitespace-nowrap text-ink underline-offset-4 hover:underline">
                          {v.make} {v.model}
                        </span>
                      </Link>
                      {v.year ? (
                        <span className="ml-2 whitespace-nowrap text-sm text-muted">{v.year}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-muted">
                        <VehicleIcon category={v.category} />
                        {CATEGORY_LABELS[v.category]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={v.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatMoney(v.dailyRate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {v.odometer.toLocaleString('en-IN')} km
                    </td>
                    <td className="px-4 py-3 text-right">
                      <VehicleRowActions vehicle={v} canRetire={can(auth.user.role, 'vehicle:delete')} />
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
    return <span className="rounded-lg border border-line px-3 py-1.5 text-muted/60">{children}</span>
  }
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string' && k !== 'page') params.set(k, v)
  }
  params.set('page', String(page))
  return (
    <Link href={`/fleet?${params}`} className="btn-quiet py-1.5">
      {children}
    </Link>
  )
}

import Link from 'next/link'
import { requireAuth } from '@/server/auth/dal'
import { Plate } from '@/components/ui'

export const metadata = { title: 'Today — Fleetdesk' }

export default async function DashboardPage() {
  const { db, user, organization } = await requireAuth()

  // Every one of these reads is scoped to this organization by the tenant client.
  const [fleetByStatus, vehicleCount, dueBack] = await Promise.all([
    db.vehicle.groupBy({ by: ['status'], _count: { _all: true } }),
    db.vehicle.count(),
    db.booking.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { endAt: 'asc' },
      take: 8,
      select: {
        id: true,
        endAt: true,
        vehicle: { select: { registrationNumber: true, make: true, model: true } },
        customer: { select: { fullName: true } },
      },
    }),
  ])

  const count = (status: string) =>
    fleetByStatus.find((row) => row.status === status)?._count._all ?? 0

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {user.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-[15px] text-muted">
            {organization.name} · {formatToday()}
          </p>
        </div>
        {/* With nothing in the fleet there is nothing to book, so the empty state below
            carries the only call to action. */}
        {vehicleCount > 0 ? (
          <Link
            href="/bookings/new"
            className="rounded-md bg-plate px-4 py-2 text-[15px] font-semibold text-ink hover:bg-plate-dark"
          >
            New booking
          </Link>
        ) : null}
      </div>

      {vehicleCount === 0 ? (
        <EmptyFleet />
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
            <Stat label="Vehicles" value={vehicleCount} />
            <Stat label="Available" value={count('AVAILABLE')} tone="available" />
            <Stat label="On rent" value={count('RENTED')} tone="rented" />
            <Stat label="In service" value={count('MAINTENANCE')} tone="maintenance" />
          </dl>

          <section className="mt-10">
            <h2 className="text-lg font-semibold tracking-tight">Due back</h2>
            {dueBack.length === 0 ? (
              <p className="mt-3 rounded-lg border border-line bg-paper px-4 py-6 text-[15px] text-muted">
                Nothing is out on rent right now.
              </p>
            ) : (
              <div className="mt-3 relative overflow-x-auto rounded-lg border border-line bg-paper">
                <table className="w-full min-w-[46rem] text-left text-[15px]">
                  <thead className="border-b border-line text-sm text-muted">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-medium">Vehicle</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">With</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Due</th>
                    <th scope="col" className="px-4 py-2.5">
                      <span className="sr-only">Next step</span>
                    </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dueBack.map((b) => (
                      <tr key={b.id} className="border-b border-line last:border-0">
                        <td className="px-4 py-3">
                          <Plate>{b.vehicle.registrationNumber}</Plate>
                          <span className="ml-2.5 whitespace-nowrap text-muted">
                            {b.vehicle.make} {b.vehicle.model}
                          </span>
                        </td>
                        <td className="px-4 py-3">{b.customer.fullName}</td>
                        <td className="px-4 py-3 text-muted">{formatDue(b.endAt)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <Link
                            href={`/bookings/${b.id}/check-in`}
                            className="rounded-md border border-line px-2.5 py-1 text-sm hover:bg-wash"
                          >
                            Take back
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'available' | 'rented' | 'maintenance'
}) {
  const color =
    tone === 'available'
      ? 'text-available'
      : tone === 'rented'
        ? 'text-rented'
        : tone === 'maintenance'
          ? 'text-maintenance'
          : 'text-ink'

  return (
    <div className="bg-paper px-4 py-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`mt-1 text-3xl font-semibold tracking-tight ${color}`}>{value}</dd>
    </div>
  )
}

function EmptyFleet() {
  return (
    <div className="mt-8 rounded-lg border border-dashed border-line bg-paper px-6 py-12 text-center">
      <h2 className="text-lg font-semibold tracking-tight">Add your first vehicle</h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] text-muted">
        Once a vehicle is on the board you can take bookings against it and hand over keys.
      </p>
      <Link
        href="/fleet/new"
        className="mt-5 inline-block rounded-md bg-plate px-4 py-2 text-[15px] font-semibold text-ink hover:bg-plate-dark"
      >
        Add a vehicle
      </Link>
    </div>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatToday() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function formatDue(date: Date) {
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

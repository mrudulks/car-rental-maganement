import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CarFront,
  KeyRound,
  Plus,
  Undo2,
} from 'lucide-react'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { getTodayBoard, type BoardBooking } from '@/server/modules/dashboard/service'
import { Plate } from '@/components/ui'
import { VehicleIcon } from '@/components/vehicle-icon'
import { Card, EmptyState, PageHeader } from '@/components/layout'

export const metadata = { title: 'Today — Fleetdesk' }

export default async function DashboardPage() {
  const auth = await requireAuth()
  const board = await getTodayBoard(auth)
  const mayHandle = can(auth.user.role, 'booking:write')

  if (board.vehicleCount === 0) {
    return (
      <div>
        <PageHeader title={`${greeting()}, ${auth.user.name.split(' ')[0]}`} meta={subtitle(auth.organization.name)} />
        <div className="mt-8">
          <EmptyState
            icon={<CarFront className="size-5" strokeWidth={1.75} />}
            title="Add your first vehicle"
            body="Once a vehicle is on the board you can take bookings against it and hand over keys."
            action={
              can(auth.user.role, 'vehicle:setRates') ? (
                <Link href="/fleet/new" className="btn-primary">
                  <Plus className="size-4" strokeWidth={2} />
                  Add a vehicle
                </Link>
              ) : null
            }
          />
        </div>
      </div>
    )
  }

  const nothingToday =
    board.overdue.length === 0 && board.goingOut.length === 0 && board.backToday.length === 0
  const nothingAtAll = nothingToday && board.upcoming.length === 0

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${auth.user.name.split(' ')[0]}`}
        meta={subtitle(auth.organization.name)}
        action={
          mayHandle ? (
            <Link href="/bookings/new" className="btn-primary">
              <Plus className="size-4" strokeWidth={2} />
              New booking
            </Link>
          ) : null
        }
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Ordered by what needs doing first, not by category. */}
        <div className="space-y-6">
          {nothingAtAll ? (
            <EmptyState
              icon={<KeyRound className="size-5" strokeWidth={1.75} />}
              title="Nothing due today"
              body="No keys to hand over and nothing coming back. The fleet is where it should be."
              action={
                mayHandle ? (
                  <Link href="/bookings/new" className="btn-primary">
                    <Plus className="size-4" strokeWidth={2} />
                    Take a booking
                  </Link>
                ) : null
              }
            />
          ) : nothingToday ? (
            <div className="rounded-xl border border-line bg-paper px-5 py-4 text-[15px] text-muted">
              Nothing due today. What is coming up is below.
            </div>
          ) : null}

          {board.overdue.length > 0 ? (
            <Card
              title="Overdue"
              description="Past the agreed return time."
              icon={<AlertTriangle className="size-[18px] text-rented" strokeWidth={1.75} />}
              className="border-rented/35"
            >
              <MovementList rows={board.overdue} action="in" mayHandle={mayHandle} tone="overdue" />
            </Card>
          ) : null}

          {board.goingOut.length > 0 ? (
            <Card
              title="Going out"
              description="Reserved and waiting for the customer."
              icon={<KeyRound className="size-[18px]" strokeWidth={1.75} />}
            >
              <MovementList rows={board.goingOut} action="out" mayHandle={mayHandle} />
            </Card>
          ) : null}

          {board.backToday.length > 0 ? (
            <Card
              title="Back today"
              description="Still out, due before the day ends."
              icon={<Undo2 className="size-[18px]" strokeWidth={1.75} />}
            >
              <MovementList rows={board.backToday} action="in" mayHandle={mayHandle} />
            </Card>
          ) : null}

          {board.upcoming.length > 0 ? (
            <Card
              title="Later this week"
              description="Reserved for the next seven days."
              icon={<CalendarDays className="size-[18px]" strokeWidth={1.75} />}
            >
              <MovementList rows={board.upcoming} action="out" mayHandle={false} showDate />
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card title="Fleet">
            <div className="px-5 py-4">
              <Utilisation percent={board.fleet.utilisation} working={board.fleet.working} rented={board.fleet.rented} />
              <ul className="mt-5 space-y-1">
                <FleetLine label="Available" value={board.fleet.available} href="/fleet?status=AVAILABLE" dot="bg-available" />
                <FleetLine label="On rent" value={board.fleet.rented} href="/fleet?status=RENTED" dot="bg-rented" />
                <FleetLine label="In service" value={board.fleet.maintenance} href="/fleet?status=MAINTENANCE" dot="bg-maintenance" />
                {board.fleet.retired > 0 ? (
                  <FleetLine label="Retired" value={board.fleet.retired} href="/fleet?status=RETIRED" dot="bg-muted" />
                ) : null}
              </ul>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function MovementList({
  rows,
  action,
  mayHandle,
  tone,
  showDate,
}: {
  rows: BoardBooking[]
  action: 'out' | 'in'
  mayHandle: boolean
  tone?: 'overdue'
  showDate?: boolean
}) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((b) => (
        <li key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
          <VehicleIcon category={b.vehicle.category} />
          <Plate>{b.vehicle.registrationNumber}</Plate>
          <Link
            href={`/bookings/${b.id}`}
            className="font-medium text-ink underline-offset-4 hover:underline"
          >
            {b.vehicle.make} {b.vehicle.model}
          </Link>
          <span className="text-muted">{b.customer.fullName}</span>
          <span className={`ml-auto text-sm ${tone === 'overdue' ? 'font-medium text-rented' : 'text-muted'}`}>
            {showDate
              ? b.startAt.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
              : action === 'in'
                ? when(b.endAt, tone === 'overdue')
                : when(b.startAt)}
          </span>
          {mayHandle ? (
            <Link
              href={`/bookings/${b.id}/${action === 'out' ? 'check-out' : 'check-in'}`}
              className="btn-quiet"
            >
              {action === 'out' ? 'Hand over' : 'Take back'}
              <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden="true" />
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** One bar, because utilisation is the single number an owner asks about. */
function Utilisation({ percent, working, rented }: { percent: number; working: number; rented: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">Out on rent</span>
        <span className="text-2xl font-semibold tracking-tight text-ink">{percent}%</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-fill-strong"
        role="img"
        aria-label={`${rented} of ${working} vehicles out on rent`}
      >
        <div className="h-full rounded-full bg-plate" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">
        {rented} of {working} on the road
      </p>
    </div>
  )
}

function FleetLine({
  label,
  value,
  href,
  dot,
}: {
  label: string
  value: number
  href: string
  dot: string
}) {
  return (
    <li>
      <Link
        href={href}
        className="-mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[15px] hover:bg-fill"
      >
        <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />
        <span className="text-ink">{label}</span>
        <span className="ml-auto font-semibold tabular-nums text-ink">{value}</span>
      </Link>
    </li>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function subtitle(org: string) {
  return `${org} · ${new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })}`
}

function when(date: Date, overdue = false) {
  const label = date.toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit' })
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  if (overdue) {
    return sameDay ? `was due ${label}` : `due ${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
  }
  return sameDay ? label : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

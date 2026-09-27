import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, Wrench } from 'lucide-react'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { getTimeline, addDays, startOfDay } from '@/server/modules/services/timeline'
import { listVehicles } from '@/server/modules/vehicles/service'
import { EmptyState, PageHeader } from '@/components/layout'
import { Timeline } from './timeline'
import { ScheduleService } from './schedule-service'

export const metadata = { title: 'Calendar — Fleetdesk' }

const SPANS = [7, 14, 30]

export default async function CalendarPage(props: PageProps<'/calendar'>) {
  const auth = await requireAuth()
  const sp = await props.searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

  const days = SPANS.includes(Number(one(sp.days))) ? Number(one(sp.days)) : 14
  const fromParam = one(sp.from)
  const parsed = fromParam ? new Date(fromParam) : new Date()
  const from = startOfDay(Number.isNaN(parsed.getTime()) ? new Date() : parsed)

  const timeline = await getTimeline(auth, { from, days })
  const mayPlan = can(auth.user.role, 'vehicle:write')
  const fleet = mayPlan ? await listVehicles(auth, { page: 1 }) : null

  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const link = (start: Date, span: number) => `/calendar?from=${iso(start)}&days=${span}`

  return (
    <div>
      <PageHeader
        title="Calendar"
        meta={`${timeline.rows.length} ${timeline.rows.length === 1 ? 'vehicle' : 'vehicles'} · ${from.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} to ${addDays(from, days - 1).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
        action={
          mayPlan && fleet && fleet.vehicles.length > 0 ? (
            <ScheduleService vehicles={fleet.vehicles.map((v) => ({
              id: v.id,
              label: `${v.registrationNumber} · ${v.make} ${v.model}`,
            }))} />
          ) : null
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link href={link(addDays(from, -days), days)} className="btn-quiet py-1.5" aria-label="Earlier">
          <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Earlier
        </Link>
        <Link href={link(new Date(), days)} className="btn-quiet py-1.5">
          Today
        </Link>
        <Link href={link(addDays(from, days), days)} className="btn-quiet py-1.5" aria-label="Later">
          Later
          <ChevronRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {SPANS.map((span) => (
            <Link
              key={span}
              href={link(from, span)}
              aria-current={span === days ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                span === days ? 'bg-ink font-medium text-paper' : 'border border-line bg-paper hover:bg-fill'
              }`}
            >
              {span} days
            </Link>
          ))}
        </div>
      </div>

      {timeline.rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<CalendarDays className="size-5" strokeWidth={1.75} />}
            title="Nothing to plan yet"
            body="Add a vehicle to the fleet and its rentals and workshop slots will appear here."
          />
        </div>
      ) : (
        <div className="mt-4">
          <Timeline rows={timeline.rows} days={timeline.days} />
        </div>
      )}

      <p className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-plate" aria-hidden="true" /> Reserved
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-sm bg-rented" aria-hidden="true" /> Out on rent
        </span>
        <span className="flex items-center gap-2">
          <Wrench className="size-3.5" strokeWidth={2} aria-hidden="true" /> In the workshop
        </span>
      </p>
    </div>
  )
}

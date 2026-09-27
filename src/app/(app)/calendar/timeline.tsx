import Link from 'next/link'
import { Wrench } from 'lucide-react'
import type { TimelineRow } from '@/server/modules/services/timeline'
import { Plate } from '@/components/ui'
import { VehicleIcon } from '@/components/vehicle-icon'
import type { VehicleCategory } from '@/generated/prisma/enums'

const DAY = 86_400_000

/**
 * Vehicles down the side, days across the top, a bar for anything that takes the
 * vehicle off the road. The gaps are the point: they are where the next booking fits.
 */
export function Timeline({ rows, days }: { rows: TimelineRow[]; days: Date[] }) {
  const from = days[0]!
  const span = days.length
  const today = new Date().toDateString()

  // Each bar is placed by grid column. A booking that began before this window starts
  // is clamped to the first column, so it still reads as "already out".
  const place = (start: Date, end: Date) => {
    const offset = Math.floor((start.getTime() - from.getTime()) / DAY)
    const endOffset = Math.ceil((end.getTime() - from.getTime()) / DAY)
    const column = Math.max(0, offset)
    const width = Math.min(span, endOffset) - column
    return { column: column + 2, width: Math.max(1, width), clippedStart: offset < 0 }
  }

  return (
    <div className="relative overflow-x-auto rounded-xl border border-line bg-paper">
      <div className="min-w-[52rem]">
        {/* Day headings */}
        <div
          className="grid border-b border-line bg-fill"
          style={{ gridTemplateColumns: `15rem repeat(${span}, minmax(2.25rem, 1fr))` }}
        >
          <div className="px-4 py-2 text-[13px] font-medium text-muted">Vehicle</div>
          {days.map((d) => {
            const isToday = d.toDateString() === today
            const weekend = d.getDay() === 0
            return (
              <div
                key={d.toISOString()}
                className={`border-l border-line px-1 py-2 text-center text-[11px] leading-tight ${
                  isToday ? 'bg-plate/25 font-semibold text-ink' : weekend ? 'text-muted/70' : 'text-muted'
                }`}
              >
                <div>{d.toLocaleDateString('en-IN', { weekday: 'narrow' })}</div>
                <div className="font-medium">{d.getDate()}</div>
              </div>
            )
          })}
        </div>

        {rows.map((row) => (
          <div
            key={row.vehicle.id}
            className="grid border-b border-line last:border-0"
            style={{ gridTemplateColumns: `15rem repeat(${span}, minmax(2.25rem, 1fr))` }}
          >
            <div
              className="flex items-center gap-2 px-4 py-2.5"
              style={{ gridRow: 1, gridColumn: 1 }}
            >
              <VehicleIcon category={row.vehicle.category as VehicleCategory} />
              <Link href={`/fleet/${row.vehicle.id}`} className="flex min-w-0 items-center gap-2">
                {/* The plate must not be squeezed by the model beside it. */}
                <span className="shrink-0">
                  <Plate>{row.vehicle.registrationNumber}</Plate>
                </span>
                <span className="truncate text-sm text-muted">
                  {row.vehicle.make} {row.vehicle.model}
                </span>
              </Link>
            </div>

            {/* Empty day cells, so the grid reads as a grid even with no bars. */}
            {/* Every cell is placed explicitly: leaving any of them to auto-flow lets a
                day cell take the label's column and the row falls apart. */}
            {days.map((d, i) => (
              <div
                key={d.toISOString()}
                className={`min-h-11 border-l border-line ${
                  d.toDateString() === today ? 'bg-plate/10' : d.getDay() === 0 ? 'bg-fill/50' : ''
                }`}
                style={{ gridRow: 1, gridColumn: i + 2 }}
              />
            ))}

            {row.bars.map((bar) => {
              const { column, width, clippedStart } = place(bar.startAt, bar.endAt)
              if (width <= 0) return null
              const service = bar.kind === 'SERVICE'
              return (
                <Link
                  key={bar.id}
                  href={bar.href}
                  title={`${bar.label} · ${bar.detail}`}
                  style={{ gridRow: 1, gridColumn: `${column} / span ${width}` }}
                  className={`z-10 m-1 flex items-center gap-1.5 overflow-hidden rounded-md px-2 py-1 text-xs font-medium ${
                    clippedStart ? 'rounded-l-none' : ''
                  } ${
                    service
                      ? 'bg-maintenance/20 text-maintenance ring-1 ring-inset ring-maintenance/40'
                      : bar.status === 'ACTIVE'
                        ? 'bg-rented text-paper'
                        : 'bg-plate text-ink'
                  }`}
                >
                  {service ? <Wrench className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" /> : null}
                  <span className="truncate">
                    {bar.label}
                    <span className="ml-1.5 font-normal opacity-80">{bar.detail}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

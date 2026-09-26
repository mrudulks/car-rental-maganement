import Link from 'next/link'
import { requireAuth } from '@/server/auth/dal'
import { can } from '@/server/auth/permissions'
import { findAvailableVehicles } from '@/server/modules/bookings/service'
import { NoAccess } from '@/components/no-access'
import { BookingForm } from './booking-form'

export const metadata = { title: 'New booking — Fleetdesk' }

/** Default window: from the next whole hour, for one day. */
function defaults() {
  const start = new Date()
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

const localInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default async function NewBookingPage(props: PageProps<'/bookings/new'>) {
  const auth = await requireAuth()
  if (!can(auth.user.role, 'booking:write')) {
    return <NoAccess what="take bookings" role={auth.user.role} />
  }

  const sp = await props.searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

  const { start, end } = defaults()
  const startAt = one(sp.startAt) ?? localInput(start)
  const endAt = one(sp.endAt) ?? localInput(end)

  const startDate = new Date(startAt)
  const endDate = new Date(endAt)
  const windowValid =
    !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate > startDate

  const vehicles = windowValid
    ? await findAvailableVehicles(auth, { startAt: startDate, endAt: endDate })
    : []

  return (
    <div className="max-w-3xl">
      <Link href="/bookings" className="text-[15px] text-muted underline underline-offset-4">
        Bookings
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">New booking</h1>
      <p className="mt-1 text-[15px] text-muted">
        Set the dates first — only vehicles free for that whole window are offered.
      </p>

      {/* Dates are a plain GET so the availability list can be linked to and reloaded. */}
      <form method="get" className="mt-8 flex flex-wrap items-end gap-4 rounded-lg border border-line bg-paper p-4">
        <div>
          <label htmlFor="startAt" className="mb-1.5 block text-sm font-medium text-ink">
            Pick-up
          </label>
          <input
            id="startAt"
            name="startAt"
            type="datetime-local"
            defaultValue={startAt}
            className="rounded-md border border-line bg-paper px-3 py-2 text-[15px]"
          />
        </div>
        <div>
          <label htmlFor="endAt" className="mb-1.5 block text-sm font-medium text-ink">
            Return
          </label>
          <input
            id="endAt"
            name="endAt"
            type="datetime-local"
            defaultValue={endAt}
            className="rounded-md border border-line bg-paper px-3 py-2 text-[15px]"
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-line bg-paper px-4 py-2 text-[15px] font-medium hover:bg-wash"
        >
          Check availability
        </button>
      </form>

      {!windowValid ? (
        <p className="mt-6 rounded-lg border border-danger/30 bg-danger/8 px-4 py-3 text-[15px] text-danger">
          The return has to be after the pick-up.
        </p>
      ) : (
        <BookingForm startAt={startAt} endAt={endAt} vehicles={vehicles} />
      )}
    </div>
  )
}

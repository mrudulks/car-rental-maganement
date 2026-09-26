import Link from 'next/link'

/**
 * Reached both by a bad URL and by anything belonging to another organization -- the
 * tenant layer answers "no such thing" rather than "not allowed", which is also the
 * honest answer, since it is not their record to know about.
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-line bg-paper px-6 py-12 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Not found</h1>
      <p className="mt-2 text-[15px] text-muted">
        That page does not exist, or it belongs to a different rental desk.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/dashboard"
          className="rounded-md bg-plate px-4 py-2 text-[15px] font-semibold text-ink hover:bg-plate-dark"
        >
          Go to Today
        </Link>
        <Link href="/fleet" className="text-[15px] underline underline-offset-4">
          See the fleet
        </Link>
      </div>
    </div>
  )
}

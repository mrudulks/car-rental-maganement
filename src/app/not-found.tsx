import Link from 'next/link'

/**
 * For URLs that match no route at all. Pages inside the signed-in shell have their own
 * not-found, which keeps the navigation; this one stands alone.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-wash px-6">
      <div className="w-full max-w-md rounded-lg border border-line bg-paper px-6 py-12 text-center">
        <span className="inline-block rounded-[3px] bg-plate px-2 py-1 font-plate text-sm font-semibold text-ink">
          FD
        </span>
        <h1 className="mt-5 text-lg font-semibold tracking-tight">Not found</h1>
        <p className="mt-2 text-[15px] text-muted">
          There is nothing at that address.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-md bg-plate px-4 py-2 text-[15px] font-semibold text-ink hover:bg-plate-dark"
        >
          Go to Fleetdesk
        </Link>
      </div>
    </main>
  )
}

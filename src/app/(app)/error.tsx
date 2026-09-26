'use client'

import Link from 'next/link'

/**
 * Last line of defence. A signed-in person should see a way forward rather than a stack
 * trace, whatever went wrong behind it.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-line bg-paper px-6 py-12 text-center">
      <h1 className="text-lg font-semibold tracking-tight">That did not load</h1>
      <p className="mt-2 text-[15px] text-muted">
        Something went wrong on our side. Try again, and if it keeps happening tell us what you
        were doing.
      </p>
      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-plate px-4 py-2 text-[15px] font-semibold text-ink hover:bg-plate-dark"
        >
          Try again
        </button>
        <Link href="/dashboard" className="text-[15px] underline underline-offset-4">
          Go to Today
        </Link>
      </div>
    </div>
  )
}

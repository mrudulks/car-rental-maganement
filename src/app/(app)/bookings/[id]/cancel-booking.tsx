'use client'

import { useState, useTransition } from 'react'
import { cancelBookingAction } from '@/app/actions/bookings'

export function CancelBooking({ bookingId }: { bookingId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const cancel = () => {
    setError(null)
    startTransition(async () => {
      const result = await cancelBookingAction(bookingId)
      if (result.error) {
        setError(result.error)
        setConfirming(false)
      }
    })
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[15px]">Cancel this booking?</span>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="rounded-md bg-danger px-3 py-1.5 text-[15px] font-semibold text-paper hover:opacity-90 disabled:opacity-60"
          >
            {pending ? 'Cancelling…' : 'Yes, cancel it'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="px-2 text-[15px] text-muted underline underline-offset-4"
          >
            Keep it
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md border border-danger/40 px-3 py-1.5 text-[15px] font-medium text-danger hover:bg-danger/8"
        >
          Cancel booking
        </button>
      )}
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { VehicleStatus } from '@/generated/prisma/enums'
import { deleteVehicleAction, setVehicleStatusAction } from '@/app/actions/vehicles'

/**
 * Retiring takes a vehicle off the board but keeps its history. Deleting is offered too,
 * but the server only allows it while the vehicle has never been rented -- and says so
 * plainly when it refuses.
 */
export function DangerZone({ vehicleId, status }: { vehicleId: string; status: VehicleStatus }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const retire = () => {
    setError(null)
    startTransition(async () => {
      const result = await setVehicleStatusAction(vehicleId, 'RETIRED')
      if (result.error) setError(result.error)
      else router.push('/fleet')
    })
  }

  const remove = () => {
    setError(null)
    startTransition(async () => {
      const result = await deleteVehicleAction(vehicleId)
      if (result.error) {
        setError(result.error)
        setConfirming(false)
      } else {
        router.push('/fleet')
      }
    })
  }

  return (
    <section className="mt-12 rounded-lg border border-line bg-paper p-5">
      <h2 className="font-semibold tracking-tight">Take this vehicle off the board</h2>
      <p className="mt-1 max-w-prose text-[15px] text-muted">
        Retiring keeps the vehicle&rsquo;s rental history and stops it appearing in new bookings.
        Deleting is only possible while it has never been rented.
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {status !== 'RETIRED' ? (
          <button
            type="button"
            onClick={retire}
            disabled={pending}
            className="rounded-md border border-line px-3 py-1.5 text-[15px] font-medium hover:bg-wash disabled:opacity-60"
          >
            Retire vehicle
          </button>
        ) : null}

        {confirming ? (
          <>
            <span className="text-[15px]">Delete permanently?</span>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md bg-danger px-3 py-1.5 text-[15px] font-semibold text-paper hover:opacity-90 disabled:opacity-60"
            >
              {pending ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-2 text-[15px] text-muted underline underline-offset-4"
            >
              Keep it
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={pending}
            className="rounded-md border border-danger/40 px-3 py-1.5 text-[15px] font-medium text-danger hover:bg-danger/8 disabled:opacity-60"
          >
            Delete vehicle
          </button>
        )}
      </div>
    </section>
  )
}

'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Pencil, RotateCcw, Wrench } from 'lucide-react'
import type { VehicleDTO } from '@/server/modules/vehicles/service'
import { setVehicleStatusAction } from '@/app/actions/vehicles'

/**
 * The one or two things worth doing straight from the row. Anything more belongs on the
 * vehicle's own page, where there is room to explain it.
 */
export function VehicleRowActions({
  vehicle,
  canRetire,
}: {
  vehicle: VehicleDTO
  canRetire: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const change = (status: 'AVAILABLE' | 'MAINTENANCE' | 'RETIRED') => {
    setError(null)
    startTransition(async () => {
      const result = await setVehicleStatusAction(vehicle.id, status)
      if (result.error) setError(result.error)
    })
  }

  const onRent = vehicle.status === 'RENTED'

  return (
    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
      {error ? (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      ) : null}

      {!onRent && vehicle.status !== 'RETIRED' ? (
        <button
          type="button"
          onClick={() => change(vehicle.status === 'MAINTENANCE' ? 'AVAILABLE' : 'MAINTENANCE')}
          disabled={pending}
          className="btn-quiet"
        >
          <Wrench className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          {vehicle.status === 'MAINTENANCE' ? 'Back in service' : 'Send to service'}
        </button>
      ) : null}

      {canRetire && vehicle.status === 'RETIRED' ? (
        <button
          type="button"
          onClick={() => change('AVAILABLE')}
          disabled={pending}
          className="btn-quiet"
        >
          <RotateCcw className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
          Return to fleet
        </button>
      ) : null}

      <Link
        href={`/fleet/${vehicle.id}`}
        className="btn-quiet"
      >
        <Pencil className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        Edit
      </Link>
    </div>
  )
}

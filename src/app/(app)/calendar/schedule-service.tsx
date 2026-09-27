'use client'

import { useActionState, useState } from 'react'
import { Wrench } from 'lucide-react'
import { scheduleServiceAction, type ServiceFormState } from '@/app/actions/services'
import { Button, Field, FormError } from '@/components/ui'

const EMPTY: ServiceFormState = {}

function localDateTime(daysAhead: number, hour: number) {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  d.setHours(hour, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ScheduleService({ vehicles }: { vehicles: Array<{ id: string; label: string }> }) {
  const [state, action, pending] = useActionState(scheduleServiceAction, EMPTY)
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(state.ok)

  // Close once the server confirms, without an extra render pass.
  if (state.ok !== seen) {
    setSeen(state.ok)
    if (state.ok) setOpen(false)
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        <Wrench className="size-4" strokeWidth={2} aria-hidden="true" />
        Book the workshop
      </button>
    )
  }

  return (
    <div className="w-full max-w-lg rounded-xl border border-line bg-paper p-5">
      <h2 className="font-semibold tracking-tight">Book the workshop</h2>
      <p className="mt-1 text-sm text-muted">
        The vehicle cannot be rented while it is booked in.
      </p>

      <form action={action} className="mt-4 space-y-4" noValidate>
        {state.error ? <FormError>{state.error}</FormError> : null}

        <div>
          <label htmlFor="field-vehicleId" className="field-label">Vehicle</label>
          <select id="field-vehicleId" name="vehicleId" className="field-control">
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
          {state.fieldErrors?.vehicleId ? (
            <p className="mt-1.5 text-sm text-danger">{state.fieldErrors.vehicleId}</p>
          ) : null}
        </div>

        <Field
          label="What is the work"
          name="reason"
          placeholder="Clutch replacement"
          defaultValue={state.values?.reason}
          error={state.fieldErrors?.reason}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Goes in"
            name="startAt"
            type="datetime-local"
            defaultValue={state.values?.startAt ?? localDateTime(1, 9)}
            error={state.fieldErrors?.startAt}
          />
          <Field
            label="Comes out"
            name="endAt"
            type="datetime-local"
            defaultValue={state.values?.endAt ?? localDateTime(2, 18)}
            error={state.fieldErrors?.endAt}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? 'Booking…' : 'Book it in'}</Button>
          <button type="button" onClick={() => setOpen(false)} className="px-2 text-[15px] text-muted underline underline-offset-4">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

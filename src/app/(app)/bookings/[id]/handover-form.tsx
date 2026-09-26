'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import type { BookingFormState } from '@/app/actions/bookings'
import { Button, Field, FormError } from '@/components/ui'

const EMPTY: BookingFormState = {}

/**
 * Both ends of a rental capture the same two readings, so they share a form. Check-in
 * adds a place to record damage while the customer is still standing there.
 */
export function HandoverForm({
  action,
  mode,
  bookingId,
  lastOdometer,
  submitLabel,
}: {
  action: (prev: BookingFormState, data: FormData) => Promise<BookingFormState>
  mode: 'out' | 'in'
  bookingId: string
  lastOdometer: number
  submitLabel: string
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY)

  return (
    <form action={formAction} className="mt-8 space-y-6" noValidate>
      {state.error ? <FormError>{state.error}</FormError> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Odometer (km)"
          name="odometer"
          type="number"
          inputMode="numeric"
          hint={`Last read ${lastOdometer.toLocaleString('en-IN')} km.`}
          defaultValue={state.values?.odometer ?? String(lastOdometer)}
          error={state.fieldErrors?.odometer}
        />
        <Field
          label="Fuel level (%)"
          name="fuelLevel"
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          hint="Roughly what the gauge shows."
          defaultValue={state.values?.fuelLevel ?? ''}
          error={state.fieldErrors?.fuelLevel}
        />
      </div>

      <Field
        label={mode === 'out' ? 'Notes at hand-over (optional)' : 'Notes on return (optional)'}
        name="notes"
        defaultValue={state.values?.notes}
        error={state.fieldErrors?.notes}
      />

      {mode === 'in' ? (
        <div>
          <label htmlFor="field-damageNotes" className="mb-1.5 block text-sm font-medium text-ink">
            Damage (optional)
          </label>
          <textarea
            id="field-damageNotes"
            name="damageNotes"
            rows={3}
            defaultValue={state.values?.damageNotes}
            placeholder="Anything new since it went out — dents, scratches, missing items."
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[15px] text-ink placeholder:text-muted/70"
          />
          {state.fieldErrors?.damageNotes ? (
            <p className="mt-1.5 text-sm text-danger">{state.fieldErrors.damageNotes}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-3 border-t border-line pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        <Link
          href={`/bookings/${bookingId}`}
          className="px-2 text-[15px] text-muted underline underline-offset-4"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}

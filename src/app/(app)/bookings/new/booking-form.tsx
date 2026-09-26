'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { createBookingAction, type BookingFormState } from '@/app/actions/bookings'
import type { AvailableVehicle } from '@/server/modules/bookings/service'
import { quote, RATE_LABELS, RATE_TYPES, type RateTypeKey } from '@/server/modules/bookings/schema'
import { CATEGORY_LABELS } from '@/server/modules/vehicles/schema'
import { Button, Field, FormError, Plate, formatMoney } from '@/components/ui'

const EMPTY: BookingFormState = {}

export function BookingForm({
  startAt,
  endAt,
  vehicles,
}: {
  startAt: string
  endAt: string
  vehicles: AvailableVehicle[]
}) {
  const [state, action, pending] = useActionState(createBookingAction, EMPTY)
  const [vehicleId, setVehicleId] = useState(state.values?.vehicleId ?? '')
  const [rateType, setRateType] = useState<RateTypeKey>(
    (state.values?.rateType as RateTypeKey) ?? 'DAILY',
  )

  const chosen = vehicles.find((v) => v.id === vehicleId)

  const rateFor = (v: AvailableVehicle, type: RateTypeKey) =>
    type === 'WEEKLY' ? v.weeklyRate : type === 'MONTHLY' ? v.monthlyRate : v.dailyRate

  const rate = chosen ? rateFor(chosen, rateType) : null
  const estimate =
    chosen && rate
      ? quote({ startAt: new Date(startAt), endAt: new Date(endAt), rateType, ratePerUnit: rate })
      : null

  if (vehicles.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-dashed border-line bg-paper px-6 py-12 text-center">
        <h2 className="text-lg font-semibold tracking-tight">Nothing free for those dates</h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-muted">
          Every vehicle is either booked for part of that window or off the road. Try a different
          window, or check what is already booked.
        </p>
        <Link href="/bookings" className="mt-5 inline-block text-[15px] underline underline-offset-4">
          See the bookings
        </Link>
      </div>
    )
  }

  return (
    <form action={action} className="mt-8 space-y-8">
      <input type="hidden" name="startAt" value={startAt} />
      <input type="hidden" name="endAt" value={endAt} />

      {state.error ? <FormError>{state.error}</FormError> : null}

      <section>
        <h2 className="text-sm font-semibold text-muted">
          Available vehicles ({vehicles.length})
        </h2>
        {state.fieldErrors?.vehicleId ? (
          <p className="mt-2 text-sm text-danger">{state.fieldErrors.vehicleId}</p>
        ) : null}

        <div className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-paper">
          {vehicles.map((v) => {
            const unavailableForRate = rateFor(v, rateType) == null
            return (
              <label
                key={v.id}
                className={`flex cursor-pointer items-center gap-4 px-4 py-3 ${
                  vehicleId === v.id ? 'bg-plate/12' : 'hover:bg-wash'
                }`}
              >
                <input
                  type="radio"
                  name="vehicleId"
                  value={v.id}
                  checked={vehicleId === v.id}
                  onChange={() => setVehicleId(v.id)}
                  className="size-4 accent-ink"
                />
                <Plate>{v.registrationNumber}</Plate>
                <span className="font-medium">
                  {v.make} {v.model}
                </span>
                <span className="text-muted">{CATEGORY_LABELS[v.category]}</span>
                <span className="ml-auto text-right">
                  {unavailableForRate ? (
                    <span className="text-sm text-muted">No {RATE_LABELS[rateType].toLowerCase()} rate</span>
                  ) : (
                    <>
                      {formatMoney(rateFor(v, rateType)!)}
                      <span className="text-sm text-muted"> {RATE_LABELS[rateType].toLowerCase()}</span>
                    </>
                  )}
                </span>
              </label>
            )
          })}
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-sm font-semibold text-muted">Customer</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Name"
            name="customerName"
            autoComplete="off"
            defaultValue={state.values?.customerName}
            error={state.fieldErrors?.customerName}
          />
          <Field
            label="Phone"
            name="customerPhone"
            type="tel"
            autoComplete="off"
            hint="A returning customer is matched on this."
            defaultValue={state.values?.customerPhone}
            error={state.fieldErrors?.customerPhone}
          />
          <Field
            label="Driving licence (optional)"
            name="customerLicence"
            autoComplete="off"
            defaultValue={state.values?.customerLicence}
            error={state.fieldErrors?.customerLicence}
          />
        </div>
      </section>

      <section className="space-y-5">
        <h2 className="text-sm font-semibold text-muted">Terms</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="field-rateType" className="mb-1.5 block text-sm font-medium text-ink">
              Charged
            </label>
            <select
              id="field-rateType"
              name="rateType"
              value={rateType}
              onChange={(e) => setRateType(e.target.value as RateTypeKey)}
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[15px]"
            >
              {RATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RATE_LABELS[t]}
                </option>
              ))}
            </select>
            {state.fieldErrors?.rateType ? (
              <p className="mt-1.5 text-sm text-danger">{state.fieldErrors.rateType}</p>
            ) : null}
          </div>
          <Field
            label="Notes (optional)"
            name="notes"
            defaultValue={state.values?.notes}
            error={state.fieldErrors?.notes}
          />
        </div>
      </section>

      {estimate && chosen ? (
        <dl className="rounded-lg border border-line bg-paper p-4 text-[15px]">
          <div className="flex justify-between">
            <dt className="text-muted">
              {estimate.units} × {RATE_LABELS[rateType].toLowerCase()} at {formatMoney(rate!)}
            </dt>
            <dd>{formatMoney(estimate.total)}</dd>
          </div>
          <div className="mt-2 flex justify-between border-t border-line pt-2">
            <dt className="font-medium">Estimated total</dt>
            <dd className="font-semibold">{formatMoney(estimate.total)}</dd>
          </div>
          <div className="mt-2 flex justify-between text-muted">
            <dt>Deposit held</dt>
            <dd>{formatMoney(chosen.depositAmount)}</dd>
          </div>
        </dl>
      ) : null}

      <div className="flex items-center gap-3 border-t border-line pt-6">
        <Button type="submit" disabled={pending || !vehicleId}>
          {pending ? 'Reserving…' : 'Reserve'}
        </Button>
        <Link href="/bookings" className="px-2 text-[15px] text-muted underline underline-offset-4">
          Cancel
        </Link>
      </div>
    </form>
  )
}

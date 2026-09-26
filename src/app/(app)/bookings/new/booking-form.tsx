'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { createBookingAction, type BookingFormState } from '@/app/actions/bookings'
import type { AvailableVehicle } from '@/server/modules/bookings/service'
import { quote, RATE_LABELS, RATE_TYPES, type RateTypeKey } from '@/server/modules/bookings/schema'
import { CATEGORY_LABELS } from '@/server/modules/vehicles/schema'
import { CarFront, ReceiptText, UserRound } from 'lucide-react'
import { Button, Field, FormError, Plate, formatMoney } from '@/components/ui'
import { VehicleIcon } from '@/components/vehicle-icon'
import { Card, EmptyState } from '@/components/layout'

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
      <div className="mt-6">
        <EmptyState
          icon={<CarFront className="size-5" strokeWidth={1.75} />}
          title="Nothing free for those dates"
          body="Every vehicle is either booked for part of that window or off the road. Try a different window, or check what is already booked."
          action={
            <Link href="/bookings" className="btn-quiet py-2">
              See the bookings
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <form action={action} className="mt-8 space-y-8">
      <input type="hidden" name="startAt" value={startAt} />
      <input type="hidden" name="endAt" value={endAt} />

      {state.error ? <FormError>{state.error}</FormError> : null}

      <Card
        title={`Available vehicles (${vehicles.length})`}
        description="Only vehicles free for the whole window are listed."
        icon={<CarFront className="size-[18px]" strokeWidth={1.75} />}
      >
        {state.fieldErrors?.vehicleId ? (
          <p className="border-b border-line px-5 py-2.5 text-sm text-danger">
            {state.fieldErrors.vehicleId}
          </p>
        ) : null}

        <div className="divide-y divide-line">
          {vehicles.map((v) => {
            const unavailableForRate = rateFor(v, rateType) == null
            return (
              <label
                key={v.id}
                className={`flex cursor-pointer items-center gap-3.5 px-5 py-3 transition-colors ${
                  vehicleId === v.id ? 'bg-plate/15' : 'hover:bg-fill'
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
                <VehicleIcon category={v.category} />
                <Plate>{v.registrationNumber}</Plate>
                <span className="font-medium whitespace-nowrap">
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
      </Card>

      <Card
        title="Customer"
        description="A returning customer is matched on their phone number."
        icon={<UserRound className="size-[18px]" strokeWidth={1.75} />}
      >
        <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
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
      </Card>

      <Card
        title="Terms"
        description="How this rental is charged."
        icon={<ReceiptText className="size-[18px]" strokeWidth={1.75} />}
      >
        <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
          <div>
            <label htmlFor="field-rateType" className="field-label">
              Charged
            </label>
            <select
              id="field-rateType"
              name="rateType"
              value={rateType}
              onChange={(e) => setRateType(e.target.value as RateTypeKey)}
              className="field-control"
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
      </Card>

      {estimate && chosen ? (
        <dl className="rounded-xl border border-plate-dark/40 bg-plate/10 p-5 text-[15px]">
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

'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import type { VehicleCategory } from '@/generated/prisma/enums'
import { CATEGORIES, CATEGORY_FIELDS, CATEGORY_LABELS } from '@/server/modules/vehicles/schema'
import type { VehicleDTO } from '@/server/modules/vehicles/service'
import type { VehicleFormState } from '@/app/actions/vehicles'
import { Button, Field, FormError } from '@/components/ui'

const EMPTY: VehicleFormState = {}

export function VehicleForm({
  action,
  vehicle,
  canSetRates,
  submitLabel,
}: {
  action: (prev: VehicleFormState, data: FormData) => Promise<VehicleFormState>
  vehicle?: VehicleDTO
  canSetRates: boolean
  submitLabel: string
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY)

  // The chosen category decides which extra fields appear, so it is the one piece of
  // form state React needs to track.
  const [category, setCategory] = useState<VehicleCategory>(
    (state.values?.category as VehicleCategory) ?? vehicle?.category ?? 'CAR',
  )

  // After a failed submit, show what was typed; otherwise the saved value.
  const val = (name: string, fallback: unknown = '') =>
    state.values?.[name] ?? (fallback == null ? '' : String(fallback))

  const attrVal = (key: string) => state.values?.[key] ?? String(vehicle?.attributes?.[key] ?? '')

  const fields = CATEGORY_FIELDS[category]

  const shownFields = new Set([
    'registrationNumber', 'make', 'model', 'year', 'color', 'odometer',
    'dailyRate', 'weeklyRate', 'monthlyRate', 'depositAmount',
    ...fields.map((f) => f.key),
  ])
  const orphanErrors = Object.entries(state.fieldErrors ?? {})
    .filter(([key]) => !shownFields.has(key))
    .map(([, message]) => message)

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {state.error ? <FormError>{state.error}</FormError> : null}
      {/* A field error only helps if its field is on screen. Anything else -- a field
          this category does not render -- is surfaced here so it cannot fail silently. */}
      {!state.error && orphanErrors.length > 0 ? (
        <FormError>{orphanErrors.join(' ')}</FormError>
      ) : null}

      <section className="space-y-5">
        <h2 className="text-sm font-semibold text-muted">Vehicle</h2>

        <div>
          <label htmlFor="field-category" className="mb-1.5 block text-sm font-medium text-ink">
            Type
          </label>
          <select
            id="field-category"
            name="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as VehicleCategory)}
            className="w-full rounded-md border border-line bg-paper px-3 py-2 text-[15px] text-ink"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Registration number"
          name="registrationNumber"
          placeholder="MH 12 AB 1234"
          defaultValue={val('registrationNumber', vehicle?.registrationNumber)}
          error={state.fieldErrors?.registrationNumber}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Make"
            name="make"
            placeholder="Maruti"
            defaultValue={val('make', vehicle?.make)}
            error={state.fieldErrors?.make}
          />
          <Field
            label="Model"
            name="model"
            placeholder="Swift"
            defaultValue={val('model', vehicle?.model)}
            error={state.fieldErrors?.model}
          />
          <Field
            label="Year"
            name="year"
            type="number"
            inputMode="numeric"
            defaultValue={val('year', vehicle?.year)}
            error={state.fieldErrors?.year}
          />
          <Field
            label="Colour"
            name="color"
            defaultValue={val('color', vehicle?.color)}
            error={state.fieldErrors?.color}
          />
          <Field
            label="Odometer"
            name="odometer"
            type="number"
            inputMode="numeric"
            hint="Kilometres on the clock today."
            defaultValue={val('odometer', vehicle?.odometer ?? 0)}
            error={state.fieldErrors?.odometer}
          />
        </div>
      </section>

      {fields.length > 0 ? (
        <section className="space-y-5">
          <h2 className="text-sm font-semibold text-muted">{CATEGORY_LABELS[category]} details</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {fields.map((field) => {
              if (field.type === 'select') {
                return (
                  <div key={field.key}>
                    <label
                      htmlFor={`field-${field.key}`}
                      className="mb-1.5 block text-sm font-medium text-ink"
                    >
                      {field.label}
                    </label>
                    <select
                      id={`field-${field.key}`}
                      name={field.key}
                      defaultValue={attrVal(field.key)}
                      aria-invalid={state.fieldErrors?.[field.key] ? true : undefined}
                      aria-describedby={
                        state.fieldErrors?.[field.key] ? `field-${field.key}-error` : undefined
                      }
                      className={`w-full rounded-md border bg-paper px-3 py-2 text-[15px] text-ink ${
                        state.fieldErrors?.[field.key] ? 'border-danger' : 'border-line'
                      }`}
                    >
                      <option value="">Not set</option>
                      {field.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {state.fieldErrors?.[field.key] ? (
                      <p id={`field-${field.key}-error`} className="mt-1.5 text-sm text-danger">
                        {state.fieldErrors[field.key]}
                      </p>
                    ) : null}
                  </div>
                )
              }

              if (field.type === 'boolean') {
                return (
                  <label
                    key={field.key}
                    htmlFor={`field-${field.key}`}
                    className="flex items-center gap-2.5 self-end pb-2 text-[15px] text-ink"
                  >
                    <input
                      id={`field-${field.key}`}
                      name={field.key}
                      type="checkbox"
                      defaultChecked={attrVal(field.key) === 'true' || attrVal(field.key) === 'on'}
                      className="size-4 rounded border-line accent-ink"
                    />
                    {field.label}
                  </label>
                )
              }

              return (
                <Field
                  key={field.key}
                  label={field.suffix ? `${field.label} (${field.suffix})` : field.label}
                  name={field.key}
                  type="number"
                  inputMode="numeric"
                  defaultValue={attrVal(field.key)}
                  error={state.fieldErrors?.[field.key]}
                />
              )
            })}
          </div>
        </section>
      ) : null}

      <section className="space-y-5">
        <h2 className="text-sm font-semibold text-muted">Rates</h2>
        {!canSetRates ? (
          <p className="rounded-md border border-line bg-wash px-3 py-2 text-sm text-muted">
            Rates are set by a manager or owner. You can still update the details above.
          </p>
        ) : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Per day (₹)"
            name="dailyRate"
            inputMode="decimal"
            disabled={!canSetRates}
            defaultValue={val('dailyRate', vehicle?.dailyRate)}
            error={state.fieldErrors?.dailyRate}
          />
          <Field
            label="Deposit (₹)"
            name="depositAmount"
            inputMode="decimal"
            disabled={!canSetRates}
            defaultValue={val('depositAmount', vehicle?.depositAmount ?? '0')}
            error={state.fieldErrors?.depositAmount}
          />
          <Field
            label="Per week (₹)"
            name="weeklyRate"
            inputMode="decimal"
            disabled={!canSetRates}
            hint="Leave blank if you do not offer one."
            defaultValue={val('weeklyRate', vehicle?.weeklyRate)}
            error={state.fieldErrors?.weeklyRate}
          />
          <Field
            label="Per month (₹)"
            name="monthlyRate"
            inputMode="decimal"
            disabled={!canSetRates}
            hint="Leave blank if you do not offer one."
            defaultValue={val('monthlyRate', vehicle?.monthlyRate)}
            error={state.fieldErrors?.monthlyRate}
          />
        </div>
        {/* Disabled inputs submit nothing, so keep the saved rates in the payload. */}
        {!canSetRates && vehicle ? (
          <>
            <input type="hidden" name="dailyRate" value={vehicle.dailyRate} />
            <input type="hidden" name="depositAmount" value={vehicle.depositAmount} />
            <input type="hidden" name="weeklyRate" value={vehicle.weeklyRate ?? ''} />
            <input type="hidden" name="monthlyRate" value={vehicle.monthlyRate ?? ''} />
          </>
        ) : null}
      </section>

      <div className="flex items-center gap-3 border-t border-line pt-6">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        <Link href="/fleet" className="px-2 text-[15px] text-muted underline underline-offset-4">
          Cancel
        </Link>
      </div>
    </form>
  )
}

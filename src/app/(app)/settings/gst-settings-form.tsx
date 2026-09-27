'use client'

import { useActionState } from 'react'
import { Building2, Percent } from 'lucide-react'
import { saveGstSettingsAction, type BillingFormState } from '@/app/actions/billing'
import { Button, Field, FormError } from '@/components/ui'
import { Card } from '@/components/layout'

const EMPTY: BillingFormState = {}

type Settings = {
  legalName: string | null
  gstin: string | null
  addressLine: string | null
  city: string | null
  state: string | null
  stateCode: string | null
  postalCode: string | null
  gstRate: string
}

const RATES = ['5', '12', '18']

export function GstSettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(saveGstSettingsAction, EMPTY)
  const val = (k: keyof Settings) => state.values?.[k] ?? settings[k] ?? ''

  return (
    <form action={action} className="space-y-6" noValidate>
      {state.error ? <FormError>{state.error}</FormError> : null}
      {state.ok ? (
        <p
          role="status"
          className="rounded-lg border border-available/30 bg-available/8 px-3 py-2 text-sm text-available"
        >
          Settings saved.
        </p>
      ) : null}

      <Card
        title="Business details"
        description="These appear on every invoice, so they must match your GST registration."
        icon={<Building2 className="size-[18px]" strokeWidth={1.75} />}
      >
        <div className="space-y-5 px-5 py-5">
          <Field
            label="Registered business name"
            name="legalName"
            placeholder="Sunrise Car Rentals Pvt Ltd"
            defaultValue={val('legalName')}
            error={state.fieldErrors?.legalName}
          />
          <Field
            label="GSTIN"
            name="gstin"
            placeholder="27AAPFU0939F1ZV"
            hint="Fifteen characters, as issued."
            defaultValue={val('gstin')}
            error={state.fieldErrors?.gstin}
          />
          <Field
            label="Address"
            name="addressLine"
            placeholder="12 MG Road"
            defaultValue={val('addressLine')}
            error={state.fieldErrors?.addressLine}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="City" name="city" defaultValue={val('city')} error={state.fieldErrors?.city} />
            <Field
              label="Postal code"
              name="postalCode"
              inputMode="numeric"
              defaultValue={val('postalCode')}
              error={state.fieldErrors?.postalCode}
            />
            <Field label="State" name="state" placeholder="Maharashtra" defaultValue={val('state')} error={state.fieldErrors?.state} />
            <Field
              label="State code"
              name="stateCode"
              inputMode="numeric"
              placeholder="27"
              hint="The two digits your GSTIN starts with."
              defaultValue={val('stateCode')}
              error={state.fieldErrors?.stateCode}
            />
          </div>
        </div>
      </Card>

      <Card
        title="Tax"
        description="Renting motor vehicles attracts different rates depending on how you are registered. Check with your accountant."
        icon={<Percent className="size-[18px]" strokeWidth={1.75} />}
      >
        <div className="px-5 py-5">
          <label htmlFor="field-gstRate" className="field-label">
            GST rate (%)
          </label>
          <input
            id="field-gstRate"
            name="gstRate"
            list="gst-rates"
            inputMode="decimal"
            defaultValue={val('gstRate')}
            className={`field-control max-w-40 ${state.fieldErrors?.gstRate ? 'border-danger' : ''}`}
          />
          <datalist id="gst-rates">
            {RATES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          {state.fieldErrors?.gstRate ? (
            <p className="mt-1.5 text-sm text-danger">{state.fieldErrors.gstRate}</p>
          ) : (
            <p className="mt-1.5 text-sm text-muted">
              Split evenly into CGST and SGST on every invoice.
            </p>
          )}
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save settings'}
        </Button>
      </div>
    </form>
  )
}

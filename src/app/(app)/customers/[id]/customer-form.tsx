'use client'

import { useActionState } from 'react'
import { updateCustomerAction, type CustomerFormState } from '@/app/actions/customers'
import type { CustomerDTO } from '@/server/modules/customers/service'
import { Button, Field, FormError } from '@/components/ui'

const EMPTY: CustomerFormState = {}

export function CustomerForm({ customer }: { customer: CustomerDTO }) {
  const action = updateCustomerAction.bind(null, customer.id)
  const [state, formAction, pending] = useActionState(action, EMPTY)

  const val = (name: keyof CustomerDTO) =>
    state.values?.[name] ?? (customer[name] == null ? '' : String(customer[name]))

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? <FormError>{state.error}</FormError> : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Name"
          name="fullName"
          defaultValue={val('fullName')}
          error={state.fieldErrors?.fullName}
        />
        <Field
          label="Phone"
          name="phone"
          type="tel"
          hint="This is how a returning customer is matched."
          defaultValue={val('phone')}
          error={state.fieldErrors?.phone}
        />
        <Field
          label="Driving licence"
          name="licenceNumber"
          defaultValue={val('licenceNumber')}
          error={state.fieldErrors?.licenceNumber}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={val('email')}
          error={state.fieldErrors?.email}
        />
      </div>

      <Field
        label="Address"
        name="address"
        defaultValue={val('address')}
        error={state.fieldErrors?.address}
      />

      <div className="border-t border-line pt-5">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

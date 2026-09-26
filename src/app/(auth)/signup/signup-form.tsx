'use client'

import { useActionState } from 'react'
import { signupAction, type FormState } from '@/app/actions/auth'
import { Button, Field, FormError } from '@/components/ui'

const EMPTY: FormState = {}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, EMPTY)

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <FormError>{state.error}</FormError> : null}

      <Field
        label="Business name"
        name="organizationName"
        autoComplete="organization"
        placeholder="Sunrise Car Rentals"
        defaultValue={state.values?.organizationName}
        error={state.fieldErrors?.organizationName}
      />
      <Field
        label="Your name"
        name="name"
        autoComplete="name"
        placeholder="Asha Menon"
        defaultValue={state.values?.name}
        error={state.fieldErrors?.name}
      />
      <Field
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="asha@sunriserentals.in"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        error={state.fieldErrors?.password}
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Creating your desk…' : 'Create account'}
      </Button>
    </form>
  )
}

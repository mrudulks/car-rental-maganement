'use client'

import { useActionState } from 'react'
import { loginAction, type FormState } from '@/app/actions/auth'
import { Button, Field, FormError } from '@/components/ui'

const EMPTY: FormState = {}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, EMPTY)

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <FormError>{state.error}</FormError> : null}

      <Field
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
      />

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}

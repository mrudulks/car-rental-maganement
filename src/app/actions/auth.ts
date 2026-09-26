'use server'

import { redirect } from 'next/navigation'
import { signup, login, AuthError } from '@/server/modules/auth/service'
import { signupSchema, loginSchema } from '@/server/modules/auth/schema'
import { createSession, destroySession } from '@/server/auth/session'

export type FormState = {
  error?: string
  fieldErrors?: Record<string, string>
  values?: Record<string, string>
}

/** Keep what the person typed (never the password) so a failed submit does not clear the form. */
function keep(formData: FormData, fields: string[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f, String(formData.get(f) ?? '')]))
}

function flatten(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

export async function signupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = keep(formData, ['organizationName', 'name', 'email'])
  const parsed = signupSchema.safeParse({
    organizationName: formData.get('organizationName'),
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { fieldErrors: flatten(parsed.error.issues), values }
  }

  try {
    const session = await signup(parsed.data)
    await createSession(session)
  } catch (error) {
    if (error instanceof AuthError) {
      return error.field
        ? { fieldErrors: { [error.field]: error.message }, values }
        : { error: error.message, values }
    }
    throw error
  }

  // redirect() throws, so it must sit outside the try block.
  redirect('/dashboard')
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = keep(formData, ['email'])
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { fieldErrors: flatten(parsed.error.issues), values }
  }

  try {
    const session = await login(parsed.data)
    await createSession(session)
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: error.message, values }
    }
    throw error
  }

  redirect('/dashboard')
}

export async function logoutAction() {
  await destroySession()
  redirect('/login')
}

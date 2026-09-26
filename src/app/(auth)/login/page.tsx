import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuth } from '@/server/auth/dal'
import { LoginForm } from './login-form'

export const metadata = { title: 'Sign in — Fleetdesk' }

export default async function LoginPage() {
  if (await getAuth()) redirect('/dashboard')

  return (
    <div>
      <h2 className="text-[1.75rem] font-semibold tracking-tight text-ink">Sign in</h2>
      <p className="mt-2 text-[15px] text-muted">Pick up where your counter left off.</p>
      <div className="mt-8">
        <LoginForm />
      </div>
      <p className="mt-6 text-[15px] text-muted">
        New here?{' '}
        <Link href="/signup" className="font-medium text-ink underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </div>
  )
}

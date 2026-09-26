import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAuth } from '@/server/auth/dal'
import { SignupForm } from './signup-form'

export const metadata = { title: 'Create your account — Fleetdesk' }

export default async function SignupPage() {
  if (await getAuth()) redirect('/dashboard')

  return (
    <div>
      <h2 className="text-[1.75rem] font-semibold tracking-tight text-ink">Set up your rental desk</h2>
      <p className="mt-2 text-[15px] text-muted">
        Takes a minute. You can add branches and staff once you are in.
      </p>
      <div className="mt-8">
        <SignupForm />
      </div>
      <p className="mt-6 text-[15px] text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  )
}

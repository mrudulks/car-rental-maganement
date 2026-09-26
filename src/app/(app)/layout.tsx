import Link from 'next/link'
import { requireAuth } from '@/server/auth/dal'
import { logoutAction } from '@/app/actions/auth'
import { MainNav } from './main-nav'

const ROLE_LABELS = { OWNER: 'Owner', MANAGER: 'Manager', STAFF: 'Staff' } as const

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, organization } = await requireAuth()

  return (
    <div className="min-h-dvh">
      {/* Keyboard users land here first and can jump the header in one press. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-plate focus:px-4 focus:py-2 focus:font-semibold focus:text-ink"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-10 border-b border-line bg-ink text-paper">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-4 sm:px-6">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5">
            <span className="rounded-[3px] bg-plate px-1.5 py-0.5 font-plate text-[13px] font-semibold text-ink">
              FD
            </span>
            <span className="hidden font-semibold tracking-tight sm:inline">Fleetdesk</span>
          </Link>

          <MainNav />

          <div className="ml-auto flex items-center gap-4">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium">{organization.name}</div>
              <div className="text-xs text-paper/60">
                {user.name} · {ROLE_LABELS[user.role]}
              </div>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-paper/25 px-3 py-1.5 text-sm text-paper/85 hover:bg-paper/10"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  )
}

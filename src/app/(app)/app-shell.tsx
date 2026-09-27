'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarClock,
  CalendarRange,
  CarFront,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react'
import type { Role } from '@/generated/prisma/enums'
import { logoutAction } from '@/app/actions/auth'

const NAV = [
  { href: '/dashboard', label: 'Today', Icon: LayoutDashboard },
  { href: '/fleet', label: 'Fleet', Icon: CarFront },
  { href: '/bookings', label: 'Bookings', Icon: CalendarClock },
  { href: '/calendar', label: 'Calendar', Icon: CalendarRange },
  { href: '/customers', label: 'Customers', Icon: Users },
] as const

// Only an owner can change the invoice details, so only an owner sees the way in.
const OWNER_NAV = [{ href: '/settings', label: 'Settings', Icon: Settings }] as const

const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  STAFF: 'Staff',
}

type Props = {
  user: { name: string; role: Role }
  organization: { name: string }
  children: React.ReactNode
}

/**
 * A left rail on desktop; on a phone it collapses behind a menu button, since a fixed
 * sidebar would eat most of a 390px screen.
 */
export function AppShell({ user, organization, children }: Props) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // The drawer closes on the tap that navigates, rather than reacting to the route
  // afterwards -- it feels immediate and avoids a second render pass.
  const close = () => setOpen(false)

  // Escape closes it, which is what a keyboard user will reach for first.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-plate focus:px-4 focus:py-2 focus:font-semibold focus:text-ink"
      >
        Skip to content
      </a>

      {/* Phone bar. The rail replaces it from lg up. */}
      <div className="flex items-center gap-3 border-b border-ink-700 bg-ink px-4 py-3 text-paper lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="app-sidebar"
          className="rounded-lg p-1.5 text-paper/80 hover:bg-paper/10 hover:text-paper"
        >
          <Menu className="size-5" strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">Open menu</span>
        </button>
        <Wordmark />
      </div>

      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={close}
          className="fixed inset-0 z-30 bg-ink/50 lg:hidden"
        />
      ) : null}

      <div
        id="app-sidebar"
        // `invisible` rather than just sliding it off-screen: a transform alone leaves
        // the closed drawer in the tab order and readable by a screen reader.
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-ink text-paper transition-transform duration-200 lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:visible lg:translate-x-0 ${
          open ? 'translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Wordmark onNavigate={close} />
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-paper/70 hover:bg-paper/10 hover:text-paper lg:hidden"
          >
            <X className="size-5" strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">Close menu</span>
          </button>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1 px-3 py-2">
          {[...NAV, ...(user.role === 'OWNER' ? OWNER_NAV : [])].map(({ Icon, ...item }) => {
            const current = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? 'page' : undefined}
                onClick={close}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors ${
                  current
                    ? 'bg-paper/15 font-medium text-paper'
                    : 'text-paper/75 hover:bg-paper/10 hover:text-paper'
                }`}
              >
                <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Who you are signed in as sits at the foot of the rail, out of the way. */}
        <div className="border-t border-paper/15 px-5 py-4">
          <p className="truncate text-sm font-medium text-paper">{organization.name}</p>
          <p className="mt-0.5 truncate text-xs text-paper/60">
            {user.name} · {ROLE_LABELS[user.role]}
          </p>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg border border-paper/25 px-3 py-1.5 text-sm text-paper/85 hover:bg-paper/10 hover:text-paper"
            >
              <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </div>

      <main id="main" className="min-w-0 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>
    </div>
  )
}

function Wordmark({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5">
      <span className="rounded-[3px] bg-plate px-1.5 py-0.5 font-plate text-[13px] font-semibold text-ink">
        FD
      </span>
      <span className="font-semibold tracking-tight">Fleetdesk</span>
    </Link>
  )
}

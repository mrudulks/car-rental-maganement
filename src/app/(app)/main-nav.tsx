'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', label: 'Today' },
  { href: '/fleet', label: 'Fleet' },
  { href: '/bookings', label: 'Bookings' },
  { href: '/customers', label: 'Customers' },
] as const

export function MainNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Main" className="-mx-1 flex items-center gap-1 overflow-x-auto px-1">
      {NAV.map((item) => {
        // /fleet/new and /fleet/<id> should still light up Fleet.
        const current = pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 text-[15px] ${
              current ? 'bg-paper/15 font-medium text-paper' : 'text-paper/75 hover:bg-paper/10 hover:text-paper'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

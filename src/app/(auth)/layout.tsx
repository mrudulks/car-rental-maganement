import Link from 'next/link'
import { Plate, StatusPill } from '@/components/ui'

/**
 * Split layout: the form on paper, and beside it the thing this product is actually
 * about -- a fleet board. Someone deciding whether to sign up sees the working screen,
 * not a pitch.
 */
const SAMPLE_FLEET = [
  { plate: 'MH 01 AB 4471', model: 'Maruti Swift', status: 'AVAILABLE' as const, due: null },
  { plate: 'MH 01 CD 9920', model: 'Toyota Innova', status: 'RENTED' as const, due: 'Back Fri, 6:00 pm' },
  { plate: 'MH 01 EF 1183', model: 'Honda Activa', status: 'RENTED' as const, due: 'Back today, 7:30 pm' },
  { plate: 'MH 01 GH 6402', model: 'Tata Ace', status: 'MAINTENANCE' as const, due: 'Clutch job' },
  { plate: 'MH 01 JK 2258', model: 'Mahindra Bolero', status: 'AVAILABLE' as const, due: null },
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1fr_minmax(420px,34rem)]">
      {/* Board panel. Hidden on small screens, where the form is all that matters. */}
      <aside className="hidden bg-ink px-10 py-12 text-paper lg:flex lg:flex-col lg:justify-between xl:px-16">
        <Link href="/" className="inline-flex w-fit items-center gap-2.5">
          <span className="rounded-[3px] bg-plate px-2 py-1 font-plate text-sm font-semibold text-ink">
            FD
          </span>
          <span className="text-lg font-semibold tracking-tight">Fleetdesk</span>
        </Link>

        <div className="my-12 max-w-xl">
          <h1 className="text-[2.6rem] leading-[1.1] font-semibold tracking-tight text-balance">
            Every vehicle, and who has it right now.
          </h1>
          <p className="mt-4 max-w-md text-[17px] leading-relaxed text-paper/70">
            Track your fleet, take bookings, and hand over keys without keeping a second
            register.
          </p>

          <div className="mt-10 overflow-hidden rounded-lg border border-paper/15 bg-ink-700/60">
            <table className="w-full text-left text-sm">
              <caption className="border-b border-paper/10 px-4 py-2.5 text-left text-[13px] font-medium text-paper/60">
                Fleet board
              </caption>
              <tbody>
                {SAMPLE_FLEET.map((v) => (
                  <tr key={v.plate} className="border-b border-paper/8 last:border-0">
                    <td className="py-2.5 pl-4 pr-3">
                      <Plate tone="dark">{v.plate}</Plate>
                    </td>
                    <td className="py-2.5 pr-3 text-paper/85">{v.model}</td>
                    <td className="py-2.5 pr-3">
                      <StatusPill status={v.status} tone="dark" />
                    </td>
                    <td className="py-2.5 pr-4 text-[13px] text-paper/55">{v.due ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-sm text-paper/45">Sample data, shown to illustrate the fleet board.</p>
      </aside>

      <main className="flex min-h-dvh items-center justify-center bg-paper px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  )
}

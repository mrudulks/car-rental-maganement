import Link from 'next/link'

/**
 * Shown when someone reaches a page their role does not allow. It names the role so the
 * person knows who to ask, rather than implying something is broken.
 */
export function NoAccess({ what, role }: { what: string; role: string }) {
  const roleLabel = { OWNER: 'owner', MANAGER: 'manager', STAFF: 'staff' }[role] ?? role.toLowerCase()

  return (
    <div className="mx-auto max-w-md rounded-lg border border-line bg-paper px-6 py-12 text-center">
      <h1 className="text-lg font-semibold tracking-tight">You cannot {what}</h1>
      <p className="mt-2 text-[15px] text-muted">
        Your account is set up as {roleLabel}. Ask an owner or manager at your rental desk if you
        need this.
      </p>
      <Link href="/fleet" className="mt-5 inline-block text-[15px] underline underline-offset-4">
        Back to the fleet
      </Link>
    </div>
  )
}

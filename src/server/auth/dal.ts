import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { readSession, type SessionPayload } from './session'
import { forOrganization, type TenantClient } from '@/server/db/tenant'
import type { Action } from './permissions'
import { assertCan } from './permissions'

/**
 * The data access layer entry point.
 *
 * Everything that renders or mutates tenant data goes through `requireAuth()`, which
 * hands back a Prisma client already locked to the caller's organization. Nothing
 * downstream has to remember to scope its queries, because it cannot unscope them.
 *
 * `cache()` dedupes the session read and the user lookup across one request.
 */
export type AuthContext = {
  session: SessionPayload
  user: {
    id: string
    name: string
    email: string
    role: SessionPayload['role']
    branchId: string | null
  }
  organization: { id: string; name: string; slug: string }
  db: TenantClient
}

export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const session = await readSession()
  if (!session) return null

  const db = forOrganization(session.organizationId)

  // The cookie proves who signed in; the database decides whether they still may.
  // A disabled user or a suspended organization loses access without waiting for the
  // token to expire.
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      branchId: true,
      status: true,
      organization: { select: { id: true, name: true, slug: true, status: true } },
    },
  })

  if (!user || user.status !== 'ACTIVE' || user.organization.status !== 'ACTIVE') return null

  return {
    // Role comes from the database, not the cookie, so a role change takes effect at once.
    session: { ...session, role: user.role, branchId: user.branchId },
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    },
    organization: user.organization,
    db,
  }
})

/** For pages and actions that require a signed-in user. Redirects when there is none. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth()
  if (!auth) redirect('/login')
  return auth
}

/** Require a signed-in user who may perform `action`. */
export async function requireAuthWith(action: Action): Promise<AuthContext> {
  const auth = await requireAuth()
  assertCan(auth.user.role, action)
  return auth
}

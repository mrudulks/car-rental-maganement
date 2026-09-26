import { prisma } from '@/server/db/client'
import { forOrganization } from '@/server/db/tenant'
import type { AuthContext } from '@/server/auth/dal'
import type { Role } from '@/generated/prisma/enums'

/**
 * Build an AuthContext without going through cookies, so services can be tested
 * directly as any role.
 */
export async function authFor(organizationId: string, role: Role = 'OWNER'): Promise<AuthContext> {
  const db = forOrganization(organizationId)
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { id: true, name: true, slug: true },
  })
  const branch = await prisma.branch.findFirstOrThrow({
    where: { organizationId },
    select: { id: true },
  })

  // A real user row, because anything that records who acted (a booking's
  // createdByUserId) has a foreign key to it.
  const email = `${role.toLowerCase()}@${org.slug}.test`
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      organizationId,
      branchId: branch.id,
      email,
      passwordHash: 'not-a-real-hash',
      name: `Test ${role}`,
      role,
    },
    select: { id: true, name: true, email: true, role: true, branchId: true },
  })

  return {
    session: { userId: user.id, organizationId, role, branchId: branch.id },
    user: { ...user, role, branchId: branch.id },
    organization: org,
    db,
  }
}

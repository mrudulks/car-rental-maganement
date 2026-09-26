import 'server-only'
import bcrypt from 'bcryptjs'
import { prisma } from '@/server/db/client'
import type { SessionPayload } from '@/server/auth/session'
import type { SignupInput, LoginInput } from './schema'

const BCRYPT_ROUNDS = 12

export class AuthError extends Error {
  constructor(
    message: string,
    readonly field?: 'email' | 'password',
  ) {
    super(message)
  }
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'org'
  )
}

/** Find a slug nobody is using yet, so two "City Rentals" can both sign up. */
async function uniqueSlug(base: string) {
  let candidate = base
  for (let i = 2; ; i++) {
    const taken = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!taken) return candidate
    candidate = `${base}-${i}`
  }
}

/**
 * Create the organization, its first branch and its owner in one transaction. A partial
 * signup would leave an organization nobody can sign in to, so all three commit together.
 */
export async function signup(input: SignupInput): Promise<SessionPayload> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  })
  if (existing) {
    throw new AuthError('That email address is already registered', 'email')
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)
  const slug = await uniqueSlug(slugify(input.organizationName))

  const user = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: input.organizationName, slug },
    })

    // Every organization gets a branch immediately, so single-location customers never
    // see the concept while multi-location ones need no migration.
    const branch = await tx.branch.create({
      data: { organizationId: org.id, name: 'Main', isDefault: true },
    })

    return tx.user.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        email: input.email,
        passwordHash,
        name: input.name,
        role: 'OWNER',
      },
      select: { id: true, organizationId: true, role: true, branchId: true },
    })
  })

  return {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    branchId: user.branchId,
  }
}

export async function login(input: LoginInput): Promise<SessionPayload> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      organizationId: true,
      role: true,
      branchId: true,
      passwordHash: true,
      status: true,
      organization: { select: { status: true } },
    },
  })

  // Hash a throwaway password when the user is missing so a wrong email and a wrong
  // password take the same time to answer, and neither reveals which was wrong.
  const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv'
  const ok = await bcrypt.compare(input.password, hash)

  if (!user || !ok) {
    throw new AuthError('Email or password is incorrect')
  }
  if (user.status !== 'ACTIVE' || user.organization.status !== 'ACTIVE') {
    throw new AuthError('This account has been disabled. Contact your administrator.')
  }

  return {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    branchId: user.branchId,
  }
}

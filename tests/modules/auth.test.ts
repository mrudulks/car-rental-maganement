import { beforeEach, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db/client'
import { signup, login, AuthError } from '@/server/modules/auth/service'
import { can, assertCan, ForbiddenError } from '@/server/auth/permissions'
import { resetDatabase } from '../helpers/db'

const alpha = {
  organizationName: 'Alpha Rentals',
  name: 'Asha',
  email: 'asha@alpha.test',
  password: 'correct horse battery',
}

describe('signup', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('creates the organization, a Main branch and an owner together', async () => {
    const session = await signup(alpha)

    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: session.organizationId },
      include: { branches: true, users: true },
    })

    expect(org.name).toBe('Alpha Rentals')
    expect(org.slug).toBe('alpha-rentals')
    expect(org.plan).toBe('FREE')
    expect(org.branches).toHaveLength(1)
    expect(org.branches[0]!.name).toBe('Main')
    expect(org.branches[0]!.isDefault).toBe(true)
    expect(org.users).toHaveLength(1)
    expect(org.users[0]!.role).toBe('OWNER')
    expect(session.role).toBe('OWNER')
  })

  it('never stores the password in plain text', async () => {
    const session = await signup(alpha)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } })
    expect(user.passwordHash).not.toContain(alpha.password)
    expect(user.passwordHash.startsWith('$2')).toBe(true)
  })

  it('gives two businesses with the same name distinct slugs', async () => {
    await signup(alpha)
    const second = await signup({ ...alpha, email: 'other@alpha.test' })
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: second.organizationId },
    })
    expect(org.slug).toBe('alpha-rentals-2')
  })

  it('rejects an email that is already registered', async () => {
    await signup(alpha)
    await expect(signup({ ...alpha, organizationName: 'Beta' })).rejects.toThrow(AuthError)
  })

  it('leaves nothing behind when signup fails', async () => {
    await signup(alpha)
    await expect(signup({ ...alpha, organizationName: 'Beta Rentals' })).rejects.toThrow()
    // The duplicate attempt must not have created a second organization.
    expect(await prisma.organization.count()).toBe(1)
  })
})

describe('login', () => {
  beforeEach(async () => {
    await resetDatabase()
    await signup(alpha)
  })

  it('returns a session for the right password', async () => {
    const session = await login({ email: alpha.email, password: alpha.password })
    expect(session.organizationId).toBeTruthy()
    expect(session.role).toBe('OWNER')
  })

  it('rejects a wrong password', async () => {
    await expect(login({ email: alpha.email, password: 'wrong' })).rejects.toThrow(AuthError)
  })

  it('gives the same message for an unknown email as for a wrong password', async () => {
    const unknown = await login({ email: 'nobody@nowhere.test', password: 'x' }).catch((e) => e)
    const wrong = await login({ email: alpha.email, password: 'x' }).catch((e) => e)
    expect(unknown.message).toBe(wrong.message)
  })

  it('refuses a disabled user', async () => {
    await prisma.user.updateMany({ where: { email: alpha.email }, data: { status: 'DISABLED' } })
    await expect(login({ email: alpha.email, password: alpha.password })).rejects.toThrow(
      /disabled/i,
    )
  })

  it('refuses a suspended organization', async () => {
    await prisma.organization.updateMany({ data: { status: 'SUSPENDED' } })
    await expect(login({ email: alpha.email, password: alpha.password })).rejects.toThrow(
      /disabled/i,
    )
  })
})

describe('permissions', () => {
  it('lets staff run the counter and fix vehicle details', () => {
    expect(can('STAFF', 'booking:write')).toBe(true)
    expect(can('STAFF', 'customer:write')).toBe(true)
    expect(can('STAFF', 'vehicle:read')).toBe(true)
    expect(can('STAFF', 'vehicle:write')).toBe(true)
  })

  it('keeps pricing and removing vehicles away from staff', () => {
    expect(can('STAFF', 'vehicle:setRates')).toBe(false)
    expect(can('STAFF', 'vehicle:delete')).toBe(false)
  })

  it('lets managers run their branch but not the organization', () => {
    expect(can('MANAGER', 'vehicle:delete')).toBe(true)
    expect(can('MANAGER', 'vehicle:setRates')).toBe(true)
    expect(can('MANAGER', 'user:manage')).toBe(false)
    expect(can('MANAGER', 'org:manage')).toBe(false)
  })

  it('lets owners do everything', () => {
    expect(can('OWNER', 'user:manage')).toBe(true)
    expect(can('OWNER', 'org:manage')).toBe(true)
    expect(can('OWNER', 'booking:write')).toBe(true)
  })

  it('assertCan throws for a denied action', () => {
    expect(() => assertCan('STAFF', 'vehicle:delete')).toThrow(ForbiddenError)
    expect(() => assertCan('OWNER', 'vehicle:delete')).not.toThrow()
  })
})

describe('money permissions', () => {
  it('lets staff take payments but not give them back', () => {
    expect(can('STAFF', 'payment:read')).toBe(true)
    expect(can('STAFF', 'payment:record')).toBe(true)
    expect(can('STAFF', 'payment:refund')).toBe(false)
  })

  it('lets managers refund', () => {
    expect(can('MANAGER', 'payment:refund')).toBe(true)
  })

  it('keeps GST settings to owners', () => {
    expect(can('MANAGER', 'org:manage')).toBe(false)
    expect(can('OWNER', 'org:manage')).toBe(true)
  })
})

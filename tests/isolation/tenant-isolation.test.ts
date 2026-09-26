import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db/client'
import { forOrganization } from '@/server/db/tenant'
import { resetDatabase, seedOrg, type SeededOrg } from '../helpers/db'

/**
 * The contract: a client from forOrganization(A) must never read, alter or delete a
 * row belonging to organization B -- even when handed B's row id directly.
 */
describe('tenant isolation', () => {
  let alpha: SeededOrg
  let beta: SeededOrg

  beforeAll(async () => {
    await resetDatabase()
    alpha = await seedOrg('alpha')
    beta = await seedOrg('beta')
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('reads', () => {
    it('findMany returns only the caller organization rows', async () => {
      const db = forOrganization(alpha.org.id)

      const vehicles = await db.vehicle.findMany()
      expect(vehicles).toHaveLength(1)
      expect(vehicles[0]!.id).toBe(alpha.vehicle.id)

      const customers = await db.customer.findMany()
      expect(customers.map((c) => c.id)).toEqual([alpha.customer.id])

      const users = await db.user.findMany()
      expect(users.map((u) => u.id)).toEqual([alpha.owner.id])

      const branches = await db.branch.findMany()
      expect(branches.map((b) => b.id)).toEqual([alpha.branch.id])
    })

    it('findUnique by another organization id returns null', async () => {
      const db = forOrganization(alpha.org.id)
      await expect(db.vehicle.findUnique({ where: { id: beta.vehicle.id } })).resolves.toBeNull()
      await expect(db.customer.findUnique({ where: { id: beta.customer.id } })).resolves.toBeNull()
      await expect(db.user.findUnique({ where: { id: beta.owner.id } })).resolves.toBeNull()
    })

    it('findFirst cannot reach across the boundary even with an explicit filter', async () => {
      const db = forOrganization(alpha.org.id)
      const found = await db.vehicle.findFirst({
        where: { registrationNumber: beta.vehicle.registrationNumber },
      })
      expect(found).toBeNull()
    })

    it('count only counts the caller rows', async () => {
      expect(await forOrganization(alpha.org.id).vehicle.count()).toBe(1)
      expect(await forOrganization(beta.org.id).vehicle.count()).toBe(1)
      // Both organizations exist; the unscoped client proves the rows are really there.
      expect(await prisma.vehicle.count()).toBe(2)
    })

    it('scopes Organization itself by id', async () => {
      const db = forOrganization(alpha.org.id)
      const orgs = await db.organization.findMany()
      expect(orgs.map((o) => o.id)).toEqual([alpha.org.id])
      await expect(db.organization.findUnique({ where: { id: beta.org.id } })).resolves.toBeNull()
    })
  })

  describe('writes', () => {
    it('update against another organization row changes nothing', async () => {
      const db = forOrganization(alpha.org.id)

      await expect(
        db.vehicle.update({ where: { id: beta.vehicle.id }, data: { make: 'HIJACKED' } }),
      ).rejects.toThrow()

      const untouched = await prisma.vehicle.findUniqueOrThrow({ where: { id: beta.vehicle.id } })
      expect(untouched.make).toBe('Maruti')
    })

    it('updateMany cannot touch another organization rows', async () => {
      const db = forOrganization(alpha.org.id)
      const result = await db.vehicle.updateMany({ data: { make: 'HIJACKED' } })
      expect(result.count).toBe(1)

      const betaVehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: beta.vehicle.id } })
      expect(betaVehicle.make).toBe('Maruti')

      // Put alpha back so later assertions read clean data.
      await prisma.vehicle.update({ where: { id: alpha.vehicle.id }, data: { make: 'Maruti' } })
    })

    it('delete against another organization row is refused', async () => {
      const db = forOrganization(alpha.org.id)
      await expect(db.customer.delete({ where: { id: beta.customer.id } })).rejects.toThrow()
      await expect(
        prisma.customer.findUnique({ where: { id: beta.customer.id } }),
      ).resolves.not.toBeNull()
    })

    it('deleteMany cannot reach another organization rows', async () => {
      const db = forOrganization(alpha.org.id)
      const created = await db.customer.create({
        data: { fullName: 'Throwaway', phone: '1', organizationId: alpha.org.id },
      })
      const result = await db.customer.deleteMany({ where: { id: created.id } })
      expect(result.count).toBe(1)
      expect(await prisma.customer.count()).toBe(2)
    })

    it('create forces the caller organization even when given a different one', async () => {
      const db = forOrganization(alpha.org.id)
      const created = await db.customer.create({
        // Deliberately lying about the organization: the extension must overrule it.
        data: { fullName: 'Smuggled', phone: '5', organizationId: beta.org.id },
      })
      expect(created.organizationId).toBe(alpha.org.id)
      await prisma.customer.delete({ where: { id: created.id } })
    })
  })

  it('refuses to build a client without an organization id', () => {
    expect(() => forOrganization('')).toThrow(/requires an organizationId/)
  })
})

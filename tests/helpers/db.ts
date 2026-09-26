import { prisma } from '@/server/db/client'

/** Wipe every table between test files. RESTART IDENTITY keeps runs reproducible. */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Booking", "Vehicle", "Customer", "User", "Branch", "Organization" RESTART IDENTITY CASCADE',
  )
}

export type SeededOrg = Awaited<ReturnType<typeof seedOrg>>

/** Create a self-contained organization with a branch, an owner, a vehicle and a customer. */
export async function seedOrg(slug: string) {
  const org = await prisma.organization.create({
    data: { name: `${slug} Rentals`, slug },
  })

  const branch = await prisma.branch.create({
    data: { organizationId: org.id, name: 'Main', isDefault: true },
  })

  const owner = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: `owner@${slug}.test`,
      passwordHash: 'not-a-real-hash',
      name: `${slug} Owner`,
      role: 'OWNER',
    },
  })

  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      category: 'CAR',
      registrationNumber: `${slug.toUpperCase()}-0001`,
      make: 'Maruti',
      model: 'Swift',
      dailyRate: '1500.00',
      attributes: { seats: 5, transmission: 'MANUAL' },
    },
  })

  const customer = await prisma.customer.create({
    data: {
      organizationId: org.id,
      fullName: `${slug} Customer`,
      phone: '9999999999',
    },
  })

  return { org, branch, owner, vehicle, customer }
}

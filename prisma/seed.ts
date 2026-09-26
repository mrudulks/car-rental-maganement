import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '../src/generated/prisma/client'
import type { InputJsonObject } from '../src/generated/prisma/internal/prismaNamespace'
import { PrismaPg } from '@prisma/adapter-pg'

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

const PASSWORD = 'password123'

/** Days from now, at a given hour, so seeded data is always relative to today. */
function at(dayOffset: number, hour: number) {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset)
  d.setHours(hour, 0, 0, 0)
  return d
}

async function seedOrg(opts: {
  name: string
  slug: string
  ownerEmail: string
  plateSeries: string
  vehicles: Array<{
    category: 'CAR' | 'BIKE' | 'SCOOTER' | 'VAN' | 'TRUCK'
    make: string
    model: string
    dailyRate: string
    attributes: InputJsonObject
  }>
}) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)

  const org = await prisma.organization.create({
    data: { name: opts.name, slug: opts.slug },
  })
  const branch = await prisma.branch.create({
    data: { organizationId: org.id, name: 'Main', isDefault: true, phone: '+91 20 5550 0100' },
  })

  const owner = await prisma.user.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      email: opts.ownerEmail,
      passwordHash,
      name: 'Asha Menon',
      role: 'OWNER',
    },
  })

  await prisma.user.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      email: `staff@${opts.slug}.test`,
      passwordHash,
      name: 'Ravi Kulkarni',
      role: 'STAFF',
    },
  })

  const vehicles = []
  for (const [i, v] of opts.vehicles.entries()) {
    vehicles.push(
      await prisma.vehicle.create({
        data: {
          organizationId: org.id,
          branchId: branch.id,
          category: v.category,
          registrationNumber: `${opts.plateSeries} ${String(1000 + i * 137).padStart(4, '0')}`,
          make: v.make,
          model: v.model,
          year: 2020 + (i % 5),
          color: ['White', 'Silver', 'Grey', 'Blue'][i % 4],
          dailyRate: v.dailyRate,
          depositAmount: '5000.00',
          odometer: 12000 + i * 4300,
          attributes: v.attributes,
        },
      }),
    )
  }

  const customers = await Promise.all(
    [
      { fullName: 'Nikhil Rao', phone: '+91 98200 11223', licenceNumber: 'MH12 20190001234' },
      { fullName: 'Priya Desai', phone: '+91 98200 44556', licenceNumber: 'MH14 20170005678' },
      { fullName: 'Imran Shaikh', phone: '+91 98200 77889', licenceNumber: 'MH12 20210009012' },
    ].map((c) => prisma.customer.create({ data: { ...c, organizationId: org.id } })),
  )

  // Two vehicles are out on rent right now, so the dashboard has something to show.
  const live: Array<[number, number, number, number]> = [
    // [vehicleIndex, customerIndex, startDayOffset, endDayOffset]
    [1, 0, -2, 0],
    [2, 1, -1, 2],
  ]

  for (const [vi, ci, from, to] of live) {
    const vehicle = vehicles[vi]!
    await prisma.booking.create({
      data: {
        organizationId: org.id,
        branchId: branch.id,
        vehicleId: vehicle.id,
        customerId: customers[ci]!.id,
        bookingNumber: `BK-${1000 + vi}`,
        status: 'ACTIVE',
        startAt: at(from, 10),
        endAt: at(to, 18),
        actualStartAt: at(from, 10),
        rateType: 'DAILY',
        ratePerUnit: vehicle.dailyRate,
        estimatedTotal: String(Number(vehicle.dailyRate) * (to - from)),
        depositAmount: '5000.00',
        checkoutOdometer: vehicle.odometer,
        checkoutFuelLevel: 80,
        createdByUserId: owner.id,
      },
    })
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: 'RENTED' } })
  }

  // One vehicle is off the road.
  await prisma.vehicle.update({ where: { id: vehicles[3]!.id }, data: { status: 'MAINTENANCE' } })

  // And one future reservation.
  await prisma.booking.create({
    data: {
      organizationId: org.id,
      branchId: branch.id,
      vehicleId: vehicles[0]!.id,
      customerId: customers[2]!.id,
      bookingNumber: 'BK-2000',
      status: 'RESERVED',
      startAt: at(3, 9),
      endAt: at(6, 18),
      rateType: 'DAILY',
      ratePerUnit: vehicles[0]!.dailyRate,
      estimatedTotal: String(Number(vehicles[0]!.dailyRate) * 3),
      depositAmount: '5000.00',
      createdByUserId: owner.id,
    },
  })

  console.log(`  ${opts.name}: ${opts.ownerEmail} / ${PASSWORD}`)
}

async function main() {
  console.log('Clearing existing data...')
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Booking", "Vehicle", "Customer", "User", "Branch", "Organization" RESTART IDENTITY CASCADE',
  )

  console.log('Seeding organizations:')

  await seedOrg({
    name: 'Sunrise Car Rentals',
    slug: 'sunrise-car-rentals',
    ownerEmail: 'owner@sunrise.test',
    plateSeries: 'MH 12 AB',
    vehicles: [
      { category: 'CAR', make: 'Maruti', model: 'Swift', dailyRate: '1500.00', attributes: { seats: 5, transmission: 'MANUAL', fuelType: 'PETROL' } },
      { category: 'CAR', make: 'Toyota', model: 'Innova Crysta', dailyRate: '3200.00', attributes: { seats: 7, transmission: 'MANUAL', fuelType: 'DIESEL' } },
      { category: 'SCOOTER', make: 'Honda', model: 'Activa 6G', dailyRate: '400.00', attributes: { engineCc: 110, fuelType: 'PETROL' } },
      { category: 'TRUCK', make: 'Tata', model: 'Ace Gold', dailyRate: '2100.00', attributes: { loadCapacityKg: 750, fuelType: 'DIESEL' } },
      { category: 'VAN', make: 'Mahindra', model: 'Bolero Camper', dailyRate: '2600.00', attributes: { seats: 2, loadCapacityKg: 1200 } },
      { category: 'BIKE', make: 'Royal Enfield', model: 'Classic 350', dailyRate: '900.00', attributes: { engineCc: 349 } },
    ],
  })

  // A second tenant, so tenant isolation is visible by signing in as each in turn.
  await seedOrg({
    name: 'Deccan Wheels',
    slug: 'deccan-wheels',
    ownerEmail: 'owner@deccan.test',
    plateSeries: 'MH 14 XY',
    vehicles: [
      { category: 'CAR', make: 'Hyundai', model: 'i20', dailyRate: '1700.00', attributes: { seats: 5, transmission: 'AUTOMATIC' } },
      { category: 'CAR', make: 'Tata', model: 'Nexon EV', dailyRate: '2900.00', attributes: { seats: 5, fuelType: 'ELECTRIC' } },
      { category: 'SCOOTER', make: 'TVS', model: 'Jupiter', dailyRate: '380.00', attributes: { engineCc: 110 } },
      { category: 'VAN', make: 'Maruti', model: 'Eeco Cargo', dailyRate: '1400.00', attributes: { loadCapacityKg: 600 } },
      { category: 'CAR', make: 'Honda', model: 'City', dailyRate: '2200.00', attributes: { seats: 5, transmission: 'AUTOMATIC' } },
    ],
  })

  console.log('\nDone.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

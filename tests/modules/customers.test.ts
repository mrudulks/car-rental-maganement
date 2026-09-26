import { beforeEach, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db/client'
import {
  listCustomers,
  getCustomerWithHistory,
  createCustomer,
  updateCustomer,
  searchCustomers,
  CustomerError,
} from '@/server/modules/customers/service'
import { createBooking } from '@/server/modules/bookings/service'
import { resetDatabase, seedOrg, type SeededOrg } from '../helpers/db'
import { authFor } from '../helpers/auth'

const blank = { email: null, licenceNumber: null, address: null }

describe('customers', () => {
  let alpha: SeededOrg
  let beta: SeededOrg

  beforeEach(async () => {
    await resetDatabase()
    alpha = await seedOrg('alpha')
    beta = await seedOrg('beta')
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('lists only the caller customers', async () => {
    const auth = await authFor(alpha.org.id)
    await createCustomer(auth, { fullName: 'Nikhil Rao', phone: '9000000001', ...blank })

    const mine = await listCustomers(auth)
    expect(mine.total).toBe(2)
    expect(mine.customers.map((c) => c.fullName).sort()).toEqual(['Nikhil Rao', 'alpha Customer'])

    const theirs = await listCustomers(await authFor(beta.org.id))
    expect(theirs.total).toBe(1)
  })

  it('finds a customer by name, phone or licence', async () => {
    const auth = await authFor(alpha.org.id)
    await createCustomer(auth, {
      fullName: 'Nikhil Rao',
      phone: '9812345678',
      ...blank,
      licenceNumber: 'MH12 20190001234',
    })

    expect((await listCustomers(auth, { search: 'nikhil' })).total).toBe(1)
    expect((await listCustomers(auth, { search: '98123' })).total).toBe(1)
    expect((await listCustomers(auth, { search: 'MH12 2019' })).total).toBe(1)
    expect((await listCustomers(auth, { search: 'nobody' })).total).toBe(0)
  })

  it('counts rentals and remembers the most recent one', async () => {
    const auth = await authFor(alpha.org.id)
    await createBooking(auth, {
      vehicleId: alpha.vehicle.id,
      customerId: alpha.customer.id,
      startAt: new Date('2026-06-01T10:00:00Z'),
      endAt: new Date('2026-06-03T10:00:00Z'),
      rateType: 'DAILY',
      notes: null,
    })
    await createBooking(auth, {
      vehicleId: alpha.vehicle.id,
      customerId: alpha.customer.id,
      startAt: new Date('2026-07-01T10:00:00Z'),
      endAt: new Date('2026-07-03T10:00:00Z'),
      rateType: 'DAILY',
      notes: null,
    })

    const { customers } = await listCustomers(auth)
    const row = customers.find((c) => c.id === alpha.customer.id)!
    expect(row.bookingCount).toBe(2)
    expect(row.lastRentalAt?.toISOString()).toBe('2026-07-01T10:00:00.000Z')
  })

  it('returns a customer with their rental history, newest first', async () => {
    const auth = await authFor(alpha.org.id)
    await createBooking(auth, {
      vehicleId: alpha.vehicle.id,
      customerId: alpha.customer.id,
      startAt: new Date('2026-06-01T10:00:00Z'),
      endAt: new Date('2026-06-03T10:00:00Z'),
      rateType: 'DAILY',
      notes: null,
    })
    await createBooking(auth, {
      vehicleId: alpha.vehicle.id,
      customerId: alpha.customer.id,
      startAt: new Date('2026-07-01T10:00:00Z'),
      endAt: new Date('2026-07-03T10:00:00Z'),
      rateType: 'DAILY',
      notes: null,
    })

    const customer = await getCustomerWithHistory(auth, alpha.customer.id)
    expect(customer?.bookings).toHaveLength(2)
    expect(customer?.bookings[0]!.startAt.toISOString()).toBe('2026-07-01T10:00:00.000Z')
    expect(customer?.bookings[0]!.vehicle.model).toBe('Swift')
  })

  it('cannot read another tenant customer', async () => {
    const auth = await authFor(alpha.org.id)
    expect(await getCustomerWithHistory(auth, beta.customer.id)).toBeNull()
  })

  describe('editing', () => {
    it('updates the details', async () => {
      const auth = await authFor(alpha.org.id)
      const updated = await updateCustomer(auth, alpha.customer.id, {
        fullName: 'Alpha Customer',
        phone: '9999999999',
        ...blank,
        licenceNumber: 'MH12 20200001111',
      })
      expect(updated.licenceNumber).toBe('MH12 20200001111')
    })

    it('refuses a phone number another customer already uses', async () => {
      const auth = await authFor(alpha.org.id)
      const other = await createCustomer(auth, { fullName: 'Nikhil Rao', phone: '9000000001', ...blank })

      await expect(
        updateCustomer(auth, other.id, { fullName: 'Nikhil Rao', phone: '9999999999', ...blank }),
      ).rejects.toThrow(/already uses that phone/i)
    })

    it('lets a customer keep their own phone number', async () => {
      const auth = await authFor(alpha.org.id)
      await expect(
        updateCustomer(auth, alpha.customer.id, {
          fullName: 'Renamed',
          phone: '9999999999',
          ...blank,
        }),
      ).resolves.toMatchObject({ fullName: 'Renamed' })
    })

    it('cannot edit another tenant customer', async () => {
      const auth = await authFor(alpha.org.id)
      await expect(
        updateCustomer(auth, beta.customer.id, { fullName: 'Hijacked', phone: '1231231231', ...blank }),
      ).rejects.toThrow(CustomerError)

      const untouched = await prisma.customer.findUniqueOrThrow({ where: { id: beta.customer.id } })
      expect(untouched.fullName).toBe('beta Customer')
    })
  })

  it('a phone number can repeat across organizations', async () => {
    const a = await authFor(alpha.org.id)
    const b = await authFor(beta.org.id)
    await createCustomer(a, { fullName: 'Shared Number', phone: '9777777777', ...blank })
    const other = await createCustomer(b, { fullName: 'Different Person', phone: '9777777777', ...blank })
    expect(other.fullName).toBe('Different Person')
  })

  it('search needs the read permission', async () => {
    const staff = await authFor(alpha.org.id, 'STAFF')
    await expect(searchCustomers(staff, 'alpha')).resolves.toHaveLength(1)
  })

  it('returns nothing for an empty search', async () => {
    const auth = await authFor(alpha.org.id)
    expect(await searchCustomers(auth, '   ')).toEqual([])
  })
})

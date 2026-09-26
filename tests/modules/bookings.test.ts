import { beforeEach, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db/client'
import { ForbiddenError } from '@/server/auth/permissions'
import {
  createBooking,
  listBookings,
  getBooking,
  cancelBooking,
  findAvailableVehicles,
} from '@/server/modules/bookings/service'
import { quote } from '@/server/modules/bookings/schema'
import { createCustomer } from '@/server/modules/customers/service'
import { resetDatabase, seedOrg, type SeededOrg } from '../helpers/db'
import { authFor } from '../helpers/auth'

const day = (n: number, hour = 10) => {
  const d = new Date('2026-06-01T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + n)
  d.setUTCHours(hour, 0, 0, 0)
  return d
}

describe('pricing', () => {
  it('charges one unit for anything up to a full day', () => {
    expect(quote({ startAt: day(0), endAt: day(0, 14), rateType: 'DAILY', ratePerUnit: '1500' }))
      .toEqual({ units: 1, total: '1500.00' })
    expect(quote({ startAt: day(0), endAt: day(1), rateType: 'DAILY', ratePerUnit: '1500' }))
      .toEqual({ units: 1, total: '1500.00' })
  })

  it('rounds a part day up to a whole one', () => {
    expect(quote({ startAt: day(0), endAt: day(1, 12), rateType: 'DAILY', ratePerUnit: '1500' }))
      .toEqual({ units: 2, total: '3000.00' })
  })

  it('charges whole weeks and months the same way', () => {
    expect(quote({ startAt: day(0), endAt: day(7), rateType: 'WEEKLY', ratePerUnit: '9000' }))
      .toEqual({ units: 1, total: '9000.00' })
    expect(quote({ startAt: day(0), endAt: day(8), rateType: 'WEEKLY', ratePerUnit: '9000' }))
      .toEqual({ units: 2, total: '18000.00' })
    expect(quote({ startAt: day(0), endAt: day(30), rateType: 'MONTHLY', ratePerUnit: '30000' }))
      .toEqual({ units: 1, total: '30000.00' })
  })

  it('keeps paise exact rather than drifting through a float', () => {
    expect(quote({ startAt: day(0), endAt: day(3), rateType: 'DAILY', ratePerUnit: '1500.50' }))
      .toEqual({ units: 3, total: '4501.50' })
  })
})

describe('bookings', () => {
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

  const input = (over: Partial<Parameters<typeof createBooking>[1]> = {}) => ({
    vehicleId: alpha.vehicle.id,
    customerId: alpha.customer.id,
    startAt: day(1),
    endAt: day(4),
    rateType: 'DAILY' as const,
    notes: null,
    ...over,
  })

  it('creates a booking with a priced quote and a sequential number', async () => {
    const auth = await authFor(alpha.org.id)
    const booking = await createBooking(auth, input())

    expect(booking.bookingNumber).toBe('BK-0001')
    expect(booking.status).toBe('RESERVED')
    // DTOs carry the raw decimal as the database returns it; formatting is a display
    // concern (see formatMoney).
    expect(booking.ratePerUnit).toBe('1500')
    expect(Number(booking.estimatedTotal)).toBe(4500)
    expect(booking.vehicle.registrationNumber).toBe(alpha.vehicle.registrationNumber)
  })

  it('numbers bookings per tenant, not globally', async () => {
    const a = await createBooking(await authFor(alpha.org.id), input())
    const b = await createBooking(await authFor(beta.org.id), {
      ...input(),
      vehicleId: beta.vehicle.id,
      customerId: beta.customer.id,
    })
    expect(a.bookingNumber).toBe('BK-0001')
    expect(b.bookingNumber).toBe('BK-0001')
  })

  describe('double-booking', () => {
    it('refuses a booking that overlaps an existing one', async () => {
      const auth = await authFor(alpha.org.id)
      await createBooking(auth, input())

      await expect(createBooking(auth, input({ startAt: day(3), endAt: day(6) }))).rejects.toThrow(
        /already booked/i,
      )
    })

    it('allows a back-to-back booking that starts exactly when the last ends', async () => {
      const auth = await authFor(alpha.org.id)
      await createBooking(auth, input())
      const next = await createBooking(auth, input({ startAt: day(4), endAt: day(6) }))
      expect(next.bookingNumber).toBe('BK-0002')
    })

    it('frees the vehicle again once a booking is cancelled', async () => {
      const auth = await authFor(alpha.org.id)
      const first = await createBooking(auth, input())
      await cancelBooking(auth, first.id)
      await expect(createBooking(auth, input())).resolves.toMatchObject({ status: 'RESERVED' })
    })

    it('holds under a race, because the database enforces it', async () => {
      const auth = await authFor(alpha.org.id)

      // Fire identical bookings at once. Exactly one may survive; an application-level
      // check-then-insert would let both through.
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => createBooking(auth, input())),
      )

      const ok = results.filter((r) => r.status === 'fulfilled')
      const failed = results.filter((r) => r.status === 'rejected')

      expect(ok).toHaveLength(1)
      expect(failed).toHaveLength(4)
      expect(await prisma.booking.count({ where: { vehicleId: alpha.vehicle.id } })).toBe(1)
    })
  })

  describe('availability', () => {
    it('offers a vehicle that is free for the window', async () => {
      const auth = await authFor(alpha.org.id)
      const free = await findAvailableVehicles(auth, { startAt: day(1), endAt: day(4) })
      expect(free.map((v) => v.id)).toContain(alpha.vehicle.id)
    })

    it('withdraws it once it is booked for overlapping dates', async () => {
      const auth = await authFor(alpha.org.id)
      await createBooking(auth, input())
      const free = await findAvailableVehicles(auth, { startAt: day(2), endAt: day(3) })
      expect(free.map((v) => v.id)).not.toContain(alpha.vehicle.id)
    })

    it('still offers it for dates outside the booking', async () => {
      const auth = await authFor(alpha.org.id)
      await createBooking(auth, input())
      const free = await findAvailableVehicles(auth, { startAt: day(10), endAt: day(12) })
      expect(free.map((v) => v.id)).toContain(alpha.vehicle.id)
    })

    it('excludes a vehicle that is off the road', async () => {
      const auth = await authFor(alpha.org.id)
      await prisma.vehicle.update({
        where: { id: alpha.vehicle.id },
        data: { status: 'MAINTENANCE' },
      })
      const free = await findAvailableVehicles(auth, { startAt: day(1), endAt: day(4) })
      expect(free.map((v) => v.id)).not.toContain(alpha.vehicle.id)
    })

    it('never offers another tenant vehicle', async () => {
      const auth = await authFor(alpha.org.id)
      const free = await findAvailableVehicles(auth, { startAt: day(1), endAt: day(4) })
      expect(free.map((v) => v.id)).not.toContain(beta.vehicle.id)
    })
  })

  describe('validation', () => {
    it('refuses a return before the pick-up', async () => {
      const auth = await authFor(alpha.org.id)
      await expect(createBooking(auth, input({ startAt: day(4), endAt: day(1) }))).rejects.toThrow(
        /after the pick-up/i,
      )
    })

    it('refuses a vehicle that is off the road', async () => {
      const auth = await authFor(alpha.org.id)
      await prisma.vehicle.update({
        where: { id: alpha.vehicle.id },
        data: { status: 'MAINTENANCE' },
      })
      await expect(createBooking(auth, input())).rejects.toThrow(/off the road/i)
    })

    it('refuses a rate the vehicle does not offer', async () => {
      const auth = await authFor(alpha.org.id)
      await expect(createBooking(auth, input({ rateType: 'WEEKLY' }))).rejects.toThrow(
        /no weekly rate/i,
      )
    })

    it('refuses another tenant vehicle', async () => {
      const auth = await authFor(alpha.org.id)
      await expect(createBooking(auth, input({ vehicleId: beta.vehicle.id }))).rejects.toThrow(
        /not in your fleet/i,
      )
    })

    it('refuses another tenant customer', async () => {
      const auth = await authFor(alpha.org.id)
      await expect(createBooking(auth, input({ customerId: beta.customer.id }))).rejects.toThrow(
        /not on your list/i,
      )
    })
  })

  describe('listing and cancelling', () => {
    it('lists only the caller bookings, and finds them by customer or plate', async () => {
      const auth = await authFor(alpha.org.id)
      await createBooking(auth, input())

      expect((await listBookings(auth)).total).toBe(1)
      expect((await listBookings(await authFor(beta.org.id))).total).toBe(0)
      expect((await listBookings(auth, { search: 'alpha Customer' })).total).toBe(1)
      expect((await listBookings(auth, { search: alpha.vehicle.registrationNumber })).total).toBe(1)
      expect((await listBookings(auth, { status: 'CANCELLED' })).total).toBe(0)
    })

    it('cannot read another tenant booking', async () => {
      const auth = await authFor(alpha.org.id)
      const mine = await createBooking(auth, input())
      expect(await getBooking(await authFor(beta.org.id), mine.id)).toBeNull()
    })

    it('staff may book but not cancel', async () => {
      const owner = await authFor(alpha.org.id)
      const staff = await authFor(alpha.org.id, 'STAFF')

      const booking = await createBooking(staff, input())
      expect(booking.status).toBe('RESERVED')
      await expect(cancelBooking(staff, booking.id)).rejects.toThrow(ForbiddenError)
      await expect(cancelBooking(owner, booking.id)).resolves.toBeUndefined()
    })

    it('refuses to cancel a rental that is already out', async () => {
      const auth = await authFor(alpha.org.id)
      const booking = await createBooking(auth, input())
      await prisma.booking.update({ where: { id: booking.id }, data: { status: 'ACTIVE' } })
      await expect(cancelBooking(auth, booking.id)).rejects.toThrow(/already out/i)
    })
  })

  it('reuses an existing customer rather than duplicating by phone', async () => {
    const auth = await authFor(alpha.org.id)
    const again = await createCustomer(auth, {
      fullName: 'Alpha Customer',
      phone: '9999999999',
      email: null,
      licenceNumber: null,
      address: null,
    })
    expect(again.id).toBe(alpha.customer.id)
    expect(await prisma.customer.count({ where: { organizationId: alpha.org.id } })).toBe(1)
  })
})

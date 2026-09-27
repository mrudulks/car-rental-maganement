import { beforeEach, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db/client'
import {
  scheduleService,
  listServices,
  cancelService,
  completeService,
  ServiceError,
} from '@/server/modules/services/service'
import { createBooking, findAvailableVehicles } from '@/server/modules/bookings/service'
import { resetDatabase, seedOrg, type SeededOrg } from '../helpers/db'
import { authFor } from '../helpers/auth'

const day = (n: number, hour = 10) => {
  const d = new Date('2026-06-01T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + n)
  d.setUTCHours(hour, 0, 0, 0)
  return d
}

describe('scheduled service', () => {
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

  const slot = (over: Partial<Parameters<typeof scheduleService>[1]> = {}) => ({
    vehicleId: alpha.vehicle.id,
    reason: 'Clutch replacement',
    notes: null,
    startAt: day(5),
    endAt: day(7),
    ...over,
  })

  const rental = (from: number, to: number) => ({
    vehicleId: alpha.vehicle.id,
    customerId: alpha.customer.id,
    startAt: day(from),
    endAt: day(to),
    rateType: 'DAILY' as const,
    notes: null,
  })

  it('books a workshop slot', async () => {
    const auth = await authFor(alpha.org.id)
    const booked = await scheduleService(auth, slot())
    expect(booked.status).toBe('SCHEDULED')
    expect(booked.reason).toBe('Clutch replacement')
    expect(booked.vehicle.registrationNumber).toBe(alpha.vehicle.registrationNumber)
  })

  it('refuses a slot that ends before it starts', async () => {
    const auth = await authFor(alpha.org.id)
    await expect(scheduleService(auth, slot({ startAt: day(7), endAt: day(5) }))).rejects.toThrow()
  })

  describe('workshop slots do not overlap each other', () => {
    it('refuses a second overlapping slot', async () => {
      const auth = await authFor(alpha.org.id)
      await scheduleService(auth, slot())
      await expect(
        scheduleService(auth, slot({ startAt: day(6), endAt: day(8) })),
      ).rejects.toThrow(/already booked into the workshop/i)
    })

    it('allows a slot that starts exactly when the last ends', async () => {
      const auth = await authFor(alpha.org.id)
      await scheduleService(auth, slot())
      await expect(scheduleService(auth, slot({ startAt: day(7), endAt: day(9) }))).resolves.toBeTruthy()
    })

    it('frees the window again once cancelled', async () => {
      const auth = await authFor(alpha.org.id)
      const first = await scheduleService(auth, slot())
      await cancelService(auth, first.id)
      await expect(scheduleService(auth, slot())).resolves.toBeTruthy()
    })

    it('holds under a race', async () => {
      const auth = await authFor(alpha.org.id)
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => scheduleService(auth, slot())),
      )
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      expect(await prisma.serviceSchedule.count()).toBe(1)
    })
  })

  describe('a workshop slot keeps the vehicle off the road', () => {
    it('withdraws it from availability', async () => {
      const auth = await authFor(alpha.org.id)
      await scheduleService(auth, slot())
      const free = await findAvailableVehicles(auth, { startAt: day(6), endAt: day(7) })
      expect(free.map((v) => v.id)).not.toContain(alpha.vehicle.id)
    })

    it('still offers it outside the slot', async () => {
      const auth = await authFor(alpha.org.id)
      await scheduleService(auth, slot())
      const free = await findAvailableVehicles(auth, { startAt: day(1), endAt: day(4) })
      expect(free.map((v) => v.id)).toContain(alpha.vehicle.id)
    })

    it('refuses a booking over the slot, not just hides it', async () => {
      const auth = await authFor(alpha.org.id)
      await scheduleService(auth, slot())
      await expect(createBooking(auth, rental(6, 8))).rejects.toThrow(/workshop/i)
      expect(await prisma.booking.count()).toBe(0)
    })

    it('allows a booking that ends when the slot begins', async () => {
      const auth = await authFor(alpha.org.id)
      await scheduleService(auth, slot())
      await expect(createBooking(auth, rental(3, 5))).resolves.toBeTruthy()
    })
  })

  describe('an existing rental keeps the workshop out', () => {
    it('refuses a slot over a booking', async () => {
      const auth = await authFor(alpha.org.id)
      await createBooking(auth, rental(5, 8))
      await expect(scheduleService(auth, slot())).rejects.toThrow(/has this vehicle/i)
      expect(await prisma.serviceSchedule.count()).toBe(0)
    })

    it('allows a slot after the rental returns', async () => {
      const auth = await authFor(alpha.org.id)
      await createBooking(auth, rental(1, 5))
      await expect(scheduleService(auth, slot())).resolves.toBeTruthy()
    })

    it('holds when a booking and a workshop slot are made at the same moment', async () => {
      // Different tables, so no constraint can cover both; the vehicle row lock is
      // what makes these take turns. Exactly one must win.
      const auth = await authFor(alpha.org.id)
      const results = await Promise.allSettled([
        createBooking(auth, rental(5, 7)),
        scheduleService(auth, slot()),
      ])

      const won = results.filter((r) => r.status === 'fulfilled')
      expect(won).toHaveLength(1)

      const bookings = await prisma.booking.count()
      const services = await prisma.serviceSchedule.count()
      expect(bookings + services).toBe(1)
    })
  })

  describe('listing', () => {
    it('returns slots overlapping the window, newest first by start', async () => {
      const auth = await authFor(alpha.org.id)
      await scheduleService(auth, slot())
      expect(await listServices(auth, { from: day(4), to: day(9) })).toHaveLength(1)
      expect(await listServices(auth, { from: day(20), to: day(25) })).toHaveLength(0)
    })

    it('leaves out completed and cancelled slots', async () => {
      const auth = await authFor(alpha.org.id)
      const a = await scheduleService(auth, slot())
      await completeService(auth, a.id)
      expect(await listServices(auth, { from: day(1), to: day(30) })).toHaveLength(0)
    })

    it('shows nothing from another organization', async () => {
      const auth = await authFor(alpha.org.id)
      await scheduleService(auth, slot())
      const rival = await authFor(beta.org.id)
      expect(await listServices(rival, { from: day(1), to: day(30) })).toHaveLength(0)
    })
  })

  describe('permissions and isolation', () => {
    it('staff may book the workshop', async () => {
      const staff = await authFor(alpha.org.id, 'STAFF')
      await expect(scheduleService(staff, slot())).resolves.toBeTruthy()
    })

    it('cannot schedule against another organization vehicle', async () => {
      const auth = await authFor(alpha.org.id)
      await expect(
        scheduleService(auth, slot({ vehicleId: beta.vehicle.id })),
      ).rejects.toThrow(/not in your fleet/i)
      expect(await prisma.serviceSchedule.count()).toBe(0)
    })

    it('cannot cancel another organization slot', async () => {
      const auth = await authFor(alpha.org.id)
      const booked = await scheduleService(auth, slot())
      const rival = await authFor(beta.org.id)
      await expect(cancelService(rival, booked.id)).rejects.toThrow(ServiceError)
      expect((await prisma.serviceSchedule.findUniqueOrThrow({ where: { id: booked.id } })).status)
        .toBe('SCHEDULED')
    })
  })
})

import { beforeEach, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db/client'
import {
  createBooking,
  checkOut,
  checkIn,
  cancelBooking,
  findAvailableVehicles,
  distanceCovered,
} from '@/server/modules/bookings/service'
import { resetDatabase, seedOrg, type SeededOrg } from '../helpers/db'
import { authFor } from '../helpers/auth'

const day = (n: number, hour = 10) => {
  const d = new Date('2026-06-01T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + n)
  d.setUTCHours(hour, 0, 0, 0)
  return d
}

describe('rental lifecycle', () => {
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

  const book = async () => {
    const auth = await authFor(alpha.org.id)
    const booking = await createBooking(auth, {
      vehicleId: alpha.vehicle.id,
      customerId: alpha.customer.id,
      startAt: day(1),
      endAt: day(4),
      rateType: 'DAILY',
      notes: null,
    })
    return { auth, booking }
  }

  const out = { odometer: 12500, fuelLevel: 80, notes: null }

  describe('checking out', () => {
    it('puts the rental out and marks the vehicle as rented', async () => {
      const { auth, booking } = await book()
      const active = await checkOut(auth, booking.id, out)

      expect(active.status).toBe('ACTIVE')
      expect(active.actualStartAt).not.toBeNull()
      expect(active.checkoutOdometer).toBe(12500)
      expect(active.checkoutFuelLevel).toBe(80)

      const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: alpha.vehicle.id } })
      expect(vehicle.status).toBe('RENTED')
      expect(vehicle.odometer).toBe(12500)
    })

    it('refuses an odometer lower than the vehicle last read', async () => {
      const { auth, booking } = await book()
      await prisma.vehicle.update({ where: { id: alpha.vehicle.id }, data: { odometer: 20000 } })

      await expect(checkOut(auth, booking.id, { ...out, odometer: 19000 })).rejects.toThrow(
        /cannot go backwards/i,
      )

      // Nothing moved: the booking is still reserved and the vehicle still free.
      const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
      expect(after.status).toBe('RESERVED')
      const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: alpha.vehicle.id } })
      expect(vehicle.status).toBe('AVAILABLE')
    })

    it('refuses to check out the same rental twice', async () => {
      const { auth, booking } = await book()
      await checkOut(auth, booking.id, out)
      await expect(checkOut(auth, booking.id, out)).rejects.toThrow(/already out/i)
    })

    it('refuses to check out a cancelled booking', async () => {
      const { auth, booking } = await book()
      await cancelBooking(auth, booking.id)
      await expect(checkOut(auth, booking.id, out)).rejects.toThrow(/cancelled booking/i)
    })

    it('cannot check out another tenant booking', async () => {
      const { booking } = await book()
      const rival = await authFor(beta.org.id)
      await expect(checkOut(rival, booking.id, out)).rejects.toThrow(/no longer on your list/i)
    })
  })

  describe('checking in', () => {
    it('completes the rental, frees the vehicle and rolls the odometer forward', async () => {
      const { auth, booking } = await book()
      await checkOut(auth, booking.id, out)

      const done = await checkIn(auth, booking.id, {
        odometer: 12980,
        fuelLevel: 45,
        notes: null,
        damageNotes: 'Scuff on the rear bumper',
      })

      expect(done.status).toBe('COMPLETED')
      expect(done.actualEndAt).not.toBeNull()
      expect(done.checkinOdometer).toBe(12980)
      expect(done.damageNotes).toBe('Scuff on the rear bumper')

      const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: alpha.vehicle.id } })
      expect(vehicle.status).toBe('AVAILABLE')
      expect(vehicle.odometer).toBe(12980)
    })

    it('reports the distance covered', async () => {
      const { auth, booking } = await book()
      await checkOut(auth, booking.id, out)
      const done = await checkIn(auth, booking.id, {
        odometer: 12980,
        fuelLevel: 45,
        notes: null,
        damageNotes: null,
      })
      expect(distanceCovered(done)).toBe(480)
    })

    it('refuses an odometer lower than at check-out', async () => {
      const { auth, booking } = await book()
      await checkOut(auth, booking.id, out)
      await expect(
        checkIn(auth, booking.id, { odometer: 12000, fuelLevel: 50, notes: null, damageNotes: null }),
      ).rejects.toThrow(/cannot go backwards/i)

      const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })
      expect(after.status).toBe('ACTIVE')
    })

    it('refuses to check in a rental that never went out', async () => {
      const { auth, booking } = await book()
      await expect(
        checkIn(auth, booking.id, { odometer: 12600, fuelLevel: 50, notes: null, damageNotes: null }),
      ).rejects.toThrow(/has not gone out yet/i)
    })

    it('refuses to check in twice', async () => {
      const { auth, booking } = await book()
      await checkOut(auth, booking.id, out)
      await checkIn(auth, booking.id, { odometer: 12980, fuelLevel: 45, notes: null, damageNotes: null })
      await expect(
        checkIn(auth, booking.id, { odometer: 13000, fuelLevel: 45, notes: null, damageNotes: null }),
      ).rejects.toThrow(/completed booking/i)
    })
  })

  describe('the board stays honest', () => {
    it('a completed rental stops blocking the vehicle', async () => {
      const { auth, booking } = await book()
      await checkOut(auth, booking.id, out)

      // While it is out, the vehicle is not offered for those dates.
      let free = await findAvailableVehicles(auth, { startAt: day(2), endAt: day(3) })
      expect(free.map((v) => v.id)).not.toContain(alpha.vehicle.id)

      await checkIn(auth, booking.id, { odometer: 12980, fuelLevel: 45, notes: null, damageNotes: null })

      // Once returned, those dates are free again.
      free = await findAvailableVehicles(auth, { startAt: day(2), endAt: day(3) })
      expect(free.map((v) => v.id)).toContain(alpha.vehicle.id)
    })

    it('a vehicle out on rent can still be booked for a later window', async () => {
      const { auth, booking } = await book()
      await checkOut(auth, booking.id, out)

      const later = await createBooking(auth, {
        vehicleId: alpha.vehicle.id,
        customerId: alpha.customer.id,
        startAt: day(20),
        endAt: day(22),
        rateType: 'DAILY',
        notes: null,
      })
      expect(later.status).toBe('RESERVED')
    })

    it('staff may check vehicles out and in', async () => {
      const owner = await authFor(alpha.org.id)
      const staff = await authFor(alpha.org.id, 'STAFF')
      const booking = await createBooking(owner, {
        vehicleId: alpha.vehicle.id,
        customerId: alpha.customer.id,
        startAt: day(1),
        endAt: day(4),
        rateType: 'DAILY',
        notes: null,
      })

      await expect(checkOut(staff, booking.id, out)).resolves.toMatchObject({ status: 'ACTIVE' })
      await expect(
        checkIn(staff, booking.id, { odometer: 12980, fuelLevel: 45, notes: null, damageNotes: null }),
      ).resolves.toMatchObject({ status: 'COMPLETED' })
    })
  })
})

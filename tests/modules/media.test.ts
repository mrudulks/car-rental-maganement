import { beforeEach, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db/client'
import {
  listMedia,
  confirmUpload,
  createUploadTarget,
  openPhase,
  MediaError,
} from '@/server/modules/media/service'
import { kindForType, maxBytesFor, MAX_FILES_PER_PHASE } from '@/server/modules/media/limits'
import { createBooking, checkOut, checkIn, cancelBooking } from '@/server/modules/bookings/service'
import { resetDatabase, seedOrg, type SeededOrg } from '../helpers/db'
import { authFor } from '../helpers/auth'

const day = (n: number) => {
  const d = new Date('2026-06-01T10:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d
}

describe('what may be attached', () => {
  it('recognises photographs and video', () => {
    expect(kindForType('image/jpeg')).toBe('IMAGE')
    expect(kindForType('video/mp4')).toBe('VIDEO')
    expect(kindForType('application/pdf')).toBeNull()
    expect(kindForType('text/html')).toBeNull()
  })

  it('allows video to be much larger than a photograph', () => {
    expect(maxBytesFor('VIDEO')).toBeGreaterThan(maxBytesFor('IMAGE'))
  })
})

describe('which side is open', () => {
  it('opens hand-over before the keys go out, and return while it is out', () => {
    expect(openPhase('RESERVED')).toBe('CHECK_OUT')
    expect(openPhase('ACTIVE')).toBe('CHECK_IN')
  })

  it('is closed once the rental is finished or cancelled', () => {
    expect(openPhase('COMPLETED')).toBeNull()
    expect(openPhase('CANCELLED')).toBeNull()
  })
})

describe('hand-over media', () => {
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

  const booked = async () => {
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

  /** Confirm an upload without needing a bucket, using a key of the shape the server mints. */
  const attach = (
    auth: Awaited<ReturnType<typeof authFor>>,
    bookingId: string,
    phase: 'check_out' | 'check_in',
    over: Partial<{ contentType: string; sizeBytes: number; name: string }> = {},
  ) =>
    confirmUpload(auth, bookingId, {
      storageKey: `${auth.organization.id}/${bookingId}/${phase}/${Math.random()}`,
      contentType: over.contentType ?? 'image/jpeg',
      sizeBytes: over.sizeBytes ?? 1024,
      originalName: over.name ?? 'front.jpg',
      caption: null,
    })

  it('attaches a photograph at hand-over', async () => {
    const { auth, booking } = await booked()
    const media = await attach(auth, booking.id, 'check_out')

    expect(media.phase).toBe('CHECK_OUT')
    expect(media.kind).toBe('IMAGE')
    expect(media.originalName).toBe('front.jpg')
    expect(await listMedia(auth, booking.id)).toHaveLength(1)
  })

  it('attaches video on return', async () => {
    const { auth, booking } = await booked()
    await checkOut(auth, booking.id, { odometer: 12500, fuelLevel: 80, notes: null })
    const media = await attach(auth, booking.id, 'check_in', { contentType: 'video/mp4' })
    expect(media.phase).toBe('CHECK_IN')
    expect(media.kind).toBe('VIDEO')
  })

  describe('it cannot be changed afterwards', () => {
    it('refuses an update, even straight through the database client', async () => {
      const { auth, booking } = await booked()
      const media = await attach(auth, booking.id, 'check_out')

      await expect(
        prisma.handoverMedia.update({ where: { id: media.id }, data: { caption: 'edited' } }),
      ).rejects.toThrow(/append-only/i)

      const unchanged = await prisma.handoverMedia.findUniqueOrThrow({ where: { id: media.id } })
      expect(unchanged.caption).toBeNull()
    })

    it('refuses a delete', async () => {
      const { auth, booking } = await booked()
      const media = await attach(auth, booking.id, 'check_out')

      await expect(
        prisma.handoverMedia.delete({ where: { id: media.id } }),
      ).rejects.toThrow(/append-only/i)
      expect(await prisma.handoverMedia.count()).toBe(1)
    })

    it('refuses to replace the file a row points at', async () => {
      const { auth, booking } = await booked()
      const media = await attach(auth, booking.id, 'check_out')
      await expect(
        prisma.handoverMedia.update({
          where: { id: media.id },
          data: { storageKey: 'somewhere/else' },
        }),
      ).rejects.toThrow(/append-only/i)
    })
  })

  describe('a side closes when it is done', () => {
    it('stops accepting hand-over media once the keys are out', async () => {
      const { auth, booking } = await booked()
      await attach(auth, booking.id, 'check_out')
      await checkOut(auth, booking.id, { odometer: 12500, fuelLevel: 80, notes: null })

      // The booking is now ACTIVE, so only the return side is open.
      await expect(attach(auth, booking.id, 'check_out')).rejects.toThrow(
        /does not belong to this booking/i,
      )
    })

    it('accepts nothing at all once the vehicle is back', async () => {
      const { auth, booking } = await booked()
      await checkOut(auth, booking.id, { odometer: 12500, fuelLevel: 80, notes: null })
      await checkIn(auth, booking.id, {
        odometer: 12800, fuelLevel: 40, notes: null, damageNotes: null,
      })

      await expect(attach(auth, booking.id, 'check_in')).rejects.toThrow(/closed/i)
      await expect(
        createUploadTarget(auth, booking.id, { contentType: 'image/jpeg', sizeBytes: 1000 }),
      ).rejects.toThrow(/closed/i)
    })

    it('accepts nothing on a cancelled booking', async () => {
      const { auth, booking } = await booked()
      await cancelBooking(auth, booking.id)
      await expect(attach(auth, booking.id, 'check_out')).rejects.toThrow(/closed/i)
    })

    it('keeps what was already attached after the rental closes', async () => {
      const { auth, booking } = await booked()
      await attach(auth, booking.id, 'check_out')
      await checkOut(auth, booking.id, { odometer: 12500, fuelLevel: 80, notes: null })
      await checkIn(auth, booking.id, {
        odometer: 12800, fuelLevel: 40, notes: null, damageNotes: null,
      })
      expect(await listMedia(auth, booking.id)).toHaveLength(1)
    })
  })

  describe('what is accepted', () => {
    it('refuses a file that is not a photograph or video', async () => {
      const { auth, booking } = await booked()
      await expect(
        createUploadTarget(auth, booking.id, { contentType: 'application/pdf', sizeBytes: 1000 }),
      ).rejects.toThrow(/photographs and video/i)
    })

    it('refuses a file over the limit', async () => {
      const { auth, booking } = await booked()
      await expect(
        createUploadTarget(auth, booking.id, {
          contentType: 'image/jpeg',
          sizeBytes: maxBytesFor('IMAGE') + 1,
        }),
      ).rejects.toThrow(/too large/i)
    })

    it('caps how many files one side can carry', async () => {
      const { auth, booking } = await booked()
      for (let i = 0; i < MAX_FILES_PER_PHASE; i++) await attach(auth, booking.id, 'check_out')
      await expect(
        createUploadTarget(auth, booking.id, { contentType: 'image/jpeg', sizeBytes: 1000 }),
      ).rejects.toThrow(/Up to \d+ files/i)
    })

    it('refuses a key that was never issued for this booking', async () => {
      const { auth, booking } = await booked()
      await expect(
        confirmUpload(auth, booking.id, {
          storageKey: 'someone-else/their-booking/check_out/abc',
          contentType: 'image/jpeg',
          sizeBytes: 1000,
        }),
      ).rejects.toThrow(/does not belong to this booking/i)
    })
  })

  describe('tenant isolation', () => {
    it('shows nothing from another organization', async () => {
      const { auth, booking } = await booked()
      await attach(auth, booking.id, 'check_out')
      const rival = await authFor(beta.org.id)
      expect(await listMedia(rival, booking.id)).toHaveLength(0)
    })

    it('cannot attach to another organization booking', async () => {
      const { booking } = await booked()
      const rival = await authFor(beta.org.id)
      await expect(attach(rival, booking.id, 'check_out')).rejects.toThrow(MediaError)
      expect(await prisma.handoverMedia.count()).toBe(0)
    })
  })

  it('staff may attach media, since they are the ones holding the phone', async () => {
    const owner = await authFor(alpha.org.id)
    const booking = await createBooking(owner, {
      vehicleId: alpha.vehicle.id, customerId: alpha.customer.id,
      startAt: day(1), endAt: day(4), rateType: 'DAILY', notes: null,
    })
    const staff = await authFor(alpha.org.id, 'STAFF')
    await expect(attach(staff, booking.id, 'check_out')).resolves.toBeTruthy()
  })
})

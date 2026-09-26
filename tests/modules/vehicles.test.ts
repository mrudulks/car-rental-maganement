import { beforeEach, afterAll, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db/client'
import { ForbiddenError } from '@/server/auth/permissions'
import {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  setVehicleStatus,
  deleteVehicle,
  VehicleError,
} from '@/server/modules/vehicles/service'
import { parseVehicleForm, normaliseRegistration, attributesSchema } from '@/server/modules/vehicles/schema'
import { resetDatabase, seedOrg, type SeededOrg } from '../helpers/db'
import { authFor } from '../helpers/auth'

const FORM = {
  category: 'CAR',
  registrationNumber: 'mh 12  zz 7788',
  make: 'Hyundai',
  model: 'i20',
  year: '2022',
  color: 'White',
  odometer: '14500',
  dailyRate: '1700',
  weeklyRate: '',
  monthlyRate: '',
  depositAmount: '5000',
  notes: '',
  seats: '5',
  transmission: 'AUTOMATIC',
  fuelType: 'PETROL',
  airConditioned: 'on',
}

function parsed(overrides: Record<string, unknown> = {}) {
  const result = parseVehicleForm({ ...FORM, ...overrides })
  if (!result.success) throw new Error('fixture did not parse: ' + JSON.stringify(result.error.issues))
  return result.data
}

describe('vehicle form parsing', () => {
  it('normalises a messily typed registration number', () => {
    expect(normaliseRegistration('mh 12  zz 7788 ')).toBe('MH 12 ZZ 7788')
    expect(parsed().registrationNumber).toBe('MH 12 ZZ 7788')
  })

  it('keeps only the attributes that belong to the chosen category', () => {
    // engineCc belongs to bikes, not cars, so it must not be stored on a car.
    const car = parsed({ engineCc: '350' })
    expect(car.attributes).toEqual({
      seats: 5,
      transmission: 'AUTOMATIC',
      fuelType: 'PETROL',
      airConditioned: true,
    })

    const bike = parsed({ category: 'BIKE', engineCc: '350', seats: '5' })
    expect(bike.attributes).toEqual({ engineCc: 350, fuelType: 'PETROL' })
  })

  it('drops attributes left blank rather than storing empty values', () => {
    const car = parsed({ seats: undefined, transmission: undefined, airConditioned: undefined })
    expect(car.attributes).toEqual({ fuelType: 'PETROL' })
  })

  it('rejects a bad rate', () => {
    const result = parseVehicleForm({ ...FORM, dailyRate: 'free' })
    expect(result.success).toBe(false)
  })

  it('rejects an out-of-range attribute', () => {
    expect(attributesSchema('CAR').safeParse({ seats: 500 }).success).toBe(false)
  })

  it('treats an empty optional rate as no rate', () => {
    expect(parsed({ weeklyRate: '' }).weeklyRate).toBeNull()
    expect(parsed({ weeklyRate: '9000' }).weeklyRate).toBe('9000')
  })
})

describe('vehicle service', () => {
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

  it('creates a vehicle in the caller organization', async () => {
    const auth = await authFor(alpha.org.id)
    const created = await createVehicle(auth, parsed())

    expect(created.registrationNumber).toBe('MH 12 ZZ 7788')
    expect(created.status).toBe('AVAILABLE')
    expect(created.dailyRate).toBe('1700')
    expect(created.attributes).toMatchObject({ seats: 5, transmission: 'AUTOMATIC' })

    const row = await prisma.vehicle.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.organizationId).toBe(alpha.org.id)
  })

  it('refuses a registration number already in the same fleet', async () => {
    const auth = await authFor(alpha.org.id)
    await createVehicle(auth, parsed())
    await expect(createVehicle(auth, parsed())).rejects.toThrow(VehicleError)
  })

  it('lets a different organization use the same registration number', async () => {
    await createVehicle(await authFor(alpha.org.id), parsed())
    const other = await createVehicle(await authFor(beta.org.id), parsed())
    expect(other.registrationNumber).toBe('MH 12 ZZ 7788')
  })

  it('lists only the caller fleet', async () => {
    await createVehicle(await authFor(alpha.org.id), parsed())
    const alphaList = await listVehicles(await authFor(alpha.org.id))
    const betaList = await listVehicles(await authFor(beta.org.id))

    expect(alphaList.total).toBe(2) // the seeded vehicle plus this one
    expect(betaList.total).toBe(1)
    expect(betaList.vehicles.every((v) => v.registrationNumber !== 'MH 12 ZZ 7788')).toBe(true)
  })

  it('filters by status, category and search', async () => {
    const auth = await authFor(alpha.org.id)
    await createVehicle(auth, parsed())
    await createVehicle(
      auth,
      parsed({
        category: 'BIKE',
        registrationNumber: 'MH 12 BK 0001',
        make: 'Royal Enfield',
        model: 'Classic 350',
        engineCc: '350',
      }),
    )

    expect((await listVehicles(auth, { category: 'BIKE' })).total).toBe(1)
    expect((await listVehicles(auth, { search: 'i20' })).total).toBe(1)
    expect((await listVehicles(auth, { search: 'zz 7788' })).total).toBe(1)
    expect((await listVehicles(auth, { status: 'MAINTENANCE' })).total).toBe(0)
  })

  it('cannot read a vehicle belonging to another organization', async () => {
    const auth = await authFor(alpha.org.id)
    expect(await getVehicle(auth, beta.vehicle.id)).toBeNull()
  })

  it('cannot update a vehicle belonging to another organization', async () => {
    const auth = await authFor(alpha.org.id)
    await expect(updateVehicle(auth, beta.vehicle.id, parsed())).rejects.toThrow(VehicleError)

    const untouched = await prisma.vehicle.findUniqueOrThrow({ where: { id: beta.vehicle.id } })
    expect(untouched.make).toBe('Maruti')
  })

  describe('permissions', () => {
    it('staff may not add a vehicle', async () => {
      const staff = await authFor(alpha.org.id, 'STAFF')
      await expect(createVehicle(staff, parsed())).rejects.toThrow(ForbiddenError)
    })

    it('staff may not change rates, but may fix a detail', async () => {
      const owner = await authFor(alpha.org.id)
      const staff = await authFor(alpha.org.id, 'STAFF')
      const vehicle = await createVehicle(owner, parsed())

      // Changing the daily rate is refused.
      await expect(
        updateVehicle(staff, vehicle.id, parsed({ dailyRate: '9999' })),
      ).rejects.toThrow(ForbiddenError)

      // Correcting the colour, with rates untouched, is allowed.
      const fixed = await updateVehicle(staff, vehicle.id, parsed({ color: 'Silver' }))
      expect(fixed.color).toBe('Silver')
      expect(fixed.dailyRate).toBe('1700')
    })

    it('managers may set rates and retire, owners may too', async () => {
      const manager = await authFor(alpha.org.id, 'MANAGER')
      const vehicle = await createVehicle(manager, parsed())
      const raised = await updateVehicle(manager, vehicle.id, parsed({ dailyRate: '1900' }))
      expect(raised.dailyRate).toBe('1900')
      await expect(setVehicleStatus(manager, vehicle.id, 'RETIRED')).resolves.toBeUndefined()
    })

    it('staff may not retire a vehicle', async () => {
      const owner = await authFor(alpha.org.id)
      const staff = await authFor(alpha.org.id, 'STAFF')
      const vehicle = await createVehicle(owner, parsed())
      await expect(setVehicleStatus(staff, vehicle.id, 'RETIRED')).rejects.toThrow(ForbiddenError)
    })
  })

  describe('status', () => {
    it('moves a vehicle into and out of service', async () => {
      const auth = await authFor(alpha.org.id)
      const vehicle = await createVehicle(auth, parsed())

      await setVehicleStatus(auth, vehicle.id, 'MAINTENANCE')
      expect((await getVehicle(auth, vehicle.id))?.status).toBe('MAINTENANCE')

      await setVehicleStatus(auth, vehicle.id, 'AVAILABLE')
      expect((await getVehicle(auth, vehicle.id))?.status).toBe('AVAILABLE')
    })

    it('refuses to change the status of a vehicle that is out on rent', async () => {
      const auth = await authFor(alpha.org.id)
      const vehicle = await createVehicle(auth, parsed())
      await prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: 'RENTED' } })

      await expect(setVehicleStatus(auth, vehicle.id, 'MAINTENANCE')).rejects.toThrow(/out on rent/i)
    })
  })

  describe('deleting', () => {
    it('deletes a vehicle that was never rented', async () => {
      const auth = await authFor(alpha.org.id)
      const vehicle = await createVehicle(auth, parsed())
      await deleteVehicle(auth, vehicle.id)
      expect(await getVehicle(auth, vehicle.id)).toBeNull()
    })

    it('refuses to delete a vehicle with booking history, and says to retire it', async () => {
      const auth = await authFor(alpha.org.id)
      const vehicle = await createVehicle(auth, parsed())
      await prisma.booking.create({
        data: {
          organizationId: alpha.org.id,
          branchId: alpha.branch.id,
          vehicleId: vehicle.id,
          customerId: alpha.customer.id,
          bookingNumber: 'BK-1',
          status: 'COMPLETED',
          startAt: new Date('2026-01-01T10:00:00Z'),
          endAt: new Date('2026-01-03T10:00:00Z'),
          ratePerUnit: '1700',
          estimatedTotal: '3400',
        },
      })

      await expect(deleteVehicle(auth, vehicle.id)).rejects.toThrow(/retire/i)
    })

    it('cannot delete another organization vehicle', async () => {
      const auth = await authFor(alpha.org.id)
      await expect(deleteVehicle(auth, beta.vehicle.id)).rejects.toThrow(VehicleError)
      expect(await prisma.vehicle.count({ where: { id: beta.vehicle.id } })).toBe(1)
    })
  })
})

describe('blank attribute handling', () => {
  it('treats an untouched dropdown as not set rather than invalid', () => {
    // A rendered <select> with no choice made posts "", which must not fail validation.
    const result = parseVehicleForm({ ...FORM, fuelType: '', transmission: '' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect('fuelType' in result.data.attributes).toBe(false)
      expect('transmission' in result.data.attributes).toBe(false)
    }
  })

  it('treats a cleared number as not set rather than zero', () => {
    const result = parseVehicleForm({ ...FORM, category: 'BIKE', engineCc: '' })
    expect(result.success).toBe(true)
    if (result.success) expect('engineCc' in result.data.attributes).toBe(false)
  })

  it('still rejects a dropdown value that is not on the list', () => {
    expect(parseVehicleForm({ ...FORM, fuelType: 'NUCLEAR' }).success).toBe(false)
  })
})

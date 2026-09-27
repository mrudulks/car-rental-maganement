import 'server-only'
import type { ServiceStatus } from '@/generated/prisma/enums'
import type { AuthContext } from '@/server/auth/dal'
import { assertCan } from '@/server/auth/permissions'
import { prisma } from '@/server/db/client'
import type { ServiceInput } from './schema'

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message)
  }
}

export type ServiceDTO = {
  id: string
  status: ServiceStatus
  reason: string
  notes: string | null
  startAt: Date
  endAt: Date
  vehicle: { id: string; registrationNumber: string; make: string; model: string }
}

const SELECT = {
  id: true,
  status: true,
  reason: true,
  notes: true,
  startAt: true,
  endAt: true,
  vehicle: { select: { id: true, registrationNumber: true, make: true, model: true } },
} as const

/**
 * Booking a workshop slot and booking a customer both take the same vehicle off the
 * road, but they live in different tables, so no single constraint can hold them
 * apart. Locking the vehicle row makes the two paths take turns for that vehicle:
 * whichever arrives second sees what the first wrote and is refused.
 */
async function lockVehicle(
  tx: { $queryRaw: (q: TemplateStringsArray, ...v: unknown[]) => Promise<unknown> },
  vehicleId: string,
) {
  await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${vehicleId} FOR UPDATE`
}

export async function scheduleService(
  auth: AuthContext,
  input: ServiceInput,
): Promise<ServiceDTO> {
  assertCan(auth.user.role, 'vehicle:write')

  const vehicle = await auth.db.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: { id: true },
  })
  if (!vehicle) throw new ServiceError('That vehicle is not in your fleet', 'vehicleId')

  try {
    const created = await prisma.$transaction(async (tx) => {
      await lockVehicle(tx, vehicle.id)

      const clash = await tx.booking.findFirst({
        where: {
          vehicleId: vehicle.id,
          status: { in: ['RESERVED', 'ACTIVE'] },
          startAt: { lt: input.endAt },
          endAt: { gt: input.startAt },
        },
        select: { bookingNumber: true },
      })
      if (clash) {
        throw new ServiceError(
          `${clash.bookingNumber} has this vehicle for part of those dates.`,
          'startAt',
        )
      }

      return tx.serviceSchedule.create({
        data: {
          organizationId: auth.organization.id,
          vehicleId: vehicle.id,
          reason: input.reason,
          notes: input.notes,
          startAt: input.startAt,
          endAt: input.endAt,
          createdByUserId: auth.user.id,
        },
        select: SELECT,
      })
    })

    return created
  } catch (error) {
    throw asFriendlyError(error)
  }
}

export async function listServices(
  auth: AuthContext,
  window: { from: Date; to: Date },
): Promise<ServiceDTO[]> {
  assertCan(auth.user.role, 'vehicle:read')
  return auth.db.serviceSchedule.findMany({
    where: {
      status: 'SCHEDULED',
      startAt: { lt: window.to },
      endAt: { gt: window.from },
    },
    select: SELECT,
    orderBy: { startAt: 'asc' },
  })
}

export async function cancelService(auth: AuthContext, id: string): Promise<void> {
  assertCan(auth.user.role, 'vehicle:write')
  const updated = await auth.db.serviceSchedule.updateMany({
    where: { id, status: 'SCHEDULED' },
    data: { status: 'CANCELLED' },
  })
  if (updated.count === 0) {
    throw new ServiceError('That workshop slot is no longer scheduled')
  }
}

export async function completeService(auth: AuthContext, id: string): Promise<void> {
  assertCan(auth.user.role, 'vehicle:write')
  const updated = await auth.db.serviceSchedule.updateMany({
    where: { id, status: 'SCHEDULED' },
    data: { status: 'COMPLETED' },
  })
  if (updated.count === 0) {
    throw new ServiceError('That workshop slot is no longer scheduled')
  }
}

function asFriendlyError(error: unknown) {
  if (error instanceof ServiceError) return error
  const text = error instanceof Error ? error.message : String(error)
  const code = (error as { code?: string })?.code

  if (code === '23P01' || text.includes('service_no_overlap') || text.includes('exclusion')) {
    return new ServiceError(
      'This vehicle is already booked into the workshop for part of those dates.',
      'startAt',
    )
  }
  return error
}

import 'server-only'
import type { AuthContext } from '@/server/auth/dal'
import { assertCan } from '@/server/auth/permissions'
import type { CustomerInput } from './schema'

export class CustomerError extends Error {}

export type CustomerDTO = {
  id: string
  fullName: string
  phone: string
  email: string | null
  licenceNumber: string | null
  address: string | null
}

const SELECT = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
  licenceNumber: true,
  address: true,
} as const

export async function searchCustomers(
  auth: AuthContext,
  search: string,
  limit = 10,
): Promise<CustomerDTO[]> {
  assertCan(auth.user.role, 'customer:read')

  const q = search.trim()
  if (!q) return []

  return auth.db.customer.findMany({
    where: {
      OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { licenceNumber: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: SELECT,
    orderBy: { fullName: 'asc' },
    take: limit,
  })
}

export async function getCustomer(auth: AuthContext, id: string): Promise<CustomerDTO | null> {
  assertCan(auth.user.role, 'customer:read')
  return auth.db.customer.findUnique({ where: { id }, select: SELECT })
}

export async function createCustomer(
  auth: AuthContext,
  input: CustomerInput,
): Promise<CustomerDTO> {
  assertCan(auth.user.role, 'customer:write')

  // Counter staff re-enter regulars constantly; reuse the record rather than piling up
  // duplicates that split one person's rental history.
  const existing = await auth.db.customer.findFirst({
    where: { phone: input.phone },
    select: SELECT,
  })
  if (existing) return existing

  return auth.db.customer.create({
    data: { ...input, organizationId: auth.organization.id },
    select: SELECT,
  })
}

export const PAGE_SIZE = 25

export type CustomerListRow = CustomerDTO & {
  bookingCount: number
  lastRentalAt: Date | null
}

export async function listCustomers(
  auth: AuthContext,
  filters: { search?: string; page?: number } = {},
) {
  assertCan(auth.user.role, 'customer:read')

  const q = filters.search?.trim()
  const where = q
    ? {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' as const } },
          { phone: { contains: q } },
          { licenceNumber: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {}

  const page = Math.max(1, filters.page ?? 1)

  const [rows, total] = await Promise.all([
    auth.db.customer.findMany({
      where,
      select: {
        ...SELECT,
        _count: { select: { bookings: true } },
        bookings: { select: { startAt: true }, orderBy: { startAt: 'desc' }, take: 1 },
      },
      orderBy: { fullName: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    auth.db.customer.count({ where }),
  ])

  const customers: CustomerListRow[] = rows.map(({ _count, bookings, ...c }) => ({
    ...c,
    bookingCount: _count.bookings,
    lastRentalAt: bookings[0]?.startAt ?? null,
  }))

  return { customers, total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

/** A customer with everything they have ever rented from this organization. */
export async function getCustomerWithHistory(auth: AuthContext, id: string) {
  assertCan(auth.user.role, 'customer:read')

  const customer = await auth.db.customer.findUnique({
    where: { id },
    select: {
      ...SELECT,
      bookings: {
        select: {
          id: true,
          bookingNumber: true,
          status: true,
          startAt: true,
          endAt: true,
          estimatedTotal: true,
          vehicle: { select: { registrationNumber: true, make: true, model: true } },
        },
        orderBy: { startAt: 'desc' },
      },
    },
  })
  if (!customer) return null

  const { bookings, ...rest } = customer
  return {
    ...rest,
    bookings: bookings.map((b) => ({ ...b, estimatedTotal: String(b.estimatedTotal) })),
  }
}

export async function updateCustomer(
  auth: AuthContext,
  id: string,
  input: CustomerInput,
): Promise<CustomerDTO> {
  assertCan(auth.user.role, 'customer:write')

  // Two people cannot share a phone number, since that is what identifies a returning
  // customer at the counter.
  const clash = await auth.db.customer.findFirst({
    where: { phone: input.phone, NOT: { id } },
    select: { id: true, fullName: true },
  })
  if (clash) {
    throw new CustomerError(`${clash.fullName} already uses that phone number`)
  }

  const updated = await auth.db.customer.updateMany({ where: { id }, data: input })
  if (updated.count === 0) throw new CustomerError('That customer is no longer on your list')

  return auth.db.customer.findUniqueOrThrow({ where: { id }, select: SELECT })
}

import 'server-only'
import { prisma } from './client'

/**
 * Tenant scoping.
 *
 * Every tenant-owned row carries an `organizationId`. Rather than trusting each feature
 * to remember `where: { organizationId }`, a Prisma client extension injects the scope
 * into every read and forces it on every write.
 *
 * Feature code never imports `prisma` directly -- it receives a client from
 * `forOrganization()` and simply cannot see another tenant's rows.
 *
 * `Organization` is scoped by its own `id`; everything else by `organizationId`.
 */
const SCOPE_FIELD: Record<string, string> = {
  Organization: 'id',
  Branch: 'organizationId',
  User: 'organizationId',
  Vehicle: 'organizationId',
  Customer: 'organizationId',
  Booking: 'organizationId',
  BookingCharge: 'organizationId',
  Payment: 'organizationId',
}

const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
])

const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn'])

/**
 * Sentinel used when a caller asks for a row outside its tenant. Matching no row is the
 * right answer -- the caller should see "not found", never another tenant's data and
 * never their own row silently substituted for the one they asked for.
 */
const NO_MATCH = '__cross_tenant_denied__'

function scopedWhere(where: unknown, field: string, organizationId: string) {
  const base = (where as Record<string, unknown> | undefined) ?? {}
  const supplied = base[field]

  // `Organization` is scoped by `id`, so a caller passing another org's id lands here.
  // Overwriting it would answer a different question than the one asked.
  if (supplied !== undefined && supplied !== organizationId) {
    return { ...base, [field]: NO_MATCH }
  }

  return { ...base, [field]: organizationId }
}

export function forOrganization(organizationId: string) {
  if (!organizationId) {
    throw new Error('forOrganization() requires an organizationId')
  }

  return prisma.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const field = SCOPE_FIELD[model]

          // A model we have not classified is a bug, not something to wave through.
          if (!field) {
            throw new Error(
              `Model "${model}" has no tenant scope defined. Add it to SCOPE_FIELD in src/server/db/tenant.ts.`,
            )
          }

          const a = (args ?? {}) as Record<string, unknown>

          if (WHERE_OPS.has(operation)) {
            a.where = scopedWhere(a.where, field, organizationId)
          }

          if (CREATE_OPS.has(operation)) {
            // Overwrite rather than default: a caller passing the wrong organization
            // is exactly the bug this layer exists to stop.
            if (Array.isArray(a.data)) {
              a.data = a.data.map((row) => ({ ...(row as object), [field]: organizationId }))
            } else if (a.data) {
              a.data = { ...(a.data as object), [field]: organizationId }
            }
          }

          if (operation === 'upsert') {
            a.where = scopedWhere(a.where, field, organizationId)
            a.create = { ...((a.create as object) ?? {}), [field]: organizationId }
          }

          return query(a as never)
        },
      },
    },
  })
}

export type TenantClient = ReturnType<typeof forOrganization>

import 'server-only'
import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * The unscoped Prisma client.
 *
 * Almost nothing should import this. It bypasses tenant scoping, so it is meant only
 * for code that genuinely has no organization yet -- signup and login. Feature code
 * takes a scoped client from `forOrganization()` in ./tenant instead.
 */
function createClient() {
  const connectionString = process.env.DATABASE_URL

  // node-postgres treats an absent connection string as "use the defaults", so it
  // quietly tries localhost:5432 and every query dies with ECONNREFUSED. On a host that
  // reads as a network fault when it is really missing configuration.
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Locally, copy .env.example to .env. On a host, set it ' +
        'on the application service (on Railway, reference the database service rather ' +
        'than pasting a URL).',
    )
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

type Client = ReturnType<typeof createClient>

// Next's dev server reloads modules on every edit; without this we would leak a new
// connection pool per reload until Postgres refuses connections.
const globalForPrisma = globalThis as unknown as { prisma?: Client }

let client: Client | undefined

function getClient(): Client {
  if (client) return client
  client = globalForPrisma.prisma ?? createClient()
  if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client
  return client
}

/**
 * Connected lazily, on first use rather than on import.
 *
 * `next build` imports this module while collecting page data, in a build environment
 * that has no database and does not need one. Constructing eagerly would make a missing
 * DATABASE_URL fail the build instead of the request that actually needs it.
 */
export const prisma = new Proxy({} as Client, {
  get(_target, property) {
    const instance = getClient() as unknown as Record<string | symbol, unknown>
    const value = instance[property]
    return typeof value === 'function' ? value.bind(instance) : value
  },
})

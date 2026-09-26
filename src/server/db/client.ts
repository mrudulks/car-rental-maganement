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
const createClient = () => {
  const connectionString = process.env.DATABASE_URL

  // Without this, an unset DATABASE_URL is not an error: node-postgres quietly falls
  // back to localhost:5432 and every query dies with ECONNREFUSED, which reads like a
  // network fault rather than missing configuration.
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Locally, copy .env.example to .env. On a host, set it ' +
        'on the application service (on Railway, reference the database service rather ' +
        'than pasting a URL).',
    )
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

// Next's dev server reloads modules on every edit; without this we would leak a new
// connection pool per reload until Postgres refuses connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

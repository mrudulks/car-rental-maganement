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
const createClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  })

// Next's dev server reloads modules on every edit; without this we would leak a new
// connection pool per reload until Postgres refuses connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createClient>
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

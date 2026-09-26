import { config } from 'dotenv'

// Point every test at rental_test, never the dev database.
config({ path: '.env.test', override: true })

if (!/rental_test/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL does not point at rental_test (got ${process.env.DATABASE_URL})`,
  )
}

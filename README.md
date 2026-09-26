# Fleetdesk

Multi-tenant vehicle rental management. Rental centers sign up, manage a fleet of any
vehicle type, and track rentals from booking through return.

## Running it

Requires Docker and Node 20+.

```bash
docker compose up -d       # Postgres 17 on localhost:5433
npm install                # also generates the Prisma client
cp .env.example .env       # then set SESSION_SECRET: openssl rand -base64 32
npm run db:migrate         # apply migrations
npm run seed               # two demo organizations with fleets and live rentals
npm run dev                # http://localhost:3000
```

Demo sign-ins (both `password123`):

| Organization | Email |
| --- | --- |
| Sunrise Car Rentals | `owner@sunrise.test` |
| Deccan Wheels | `owner@deccan.test` |

Signing in as each shows only that organization's fleet — the point of the tenant layer.

## Checks

```bash
npm run typecheck
npm run lint
npm test          # migrates the test database, then runs Vitest
npm run test:e2e  # full browser runs; needs `npm run dev` running
npm run test:a11y # accessibility and mobile audit across every signed-in route
npm run build
```

## How it is put together

Next.js 16 (App Router) · PostgreSQL · Prisma 7 · Tailwind 4 · Vitest · Playwright.

Two rules carry most of the weight:

**Tenant isolation.** Every tenant-owned row has an `organizationId`. No feature code
writes that filter itself — `src/server/db/tenant.ts` is a Prisma client extension that
injects the scope into every read and forces it on every write. Pages and actions get a
pre-scoped client from `requireAuth()` in `src/server/auth/dal.ts` and cannot reach
another tenant's rows. `tests/isolation/` is the suite that keeps this true.

**No double-booking.** Checking for a clash in application code loses the race under
concurrency, so Postgres enforces it with an exclusion constraint over
`(vehicleId, [startAt, endAt))` for bookings that are `RESERVED` or `ACTIVE`
(`prisma/migrations/*_booking_no_overlap`). The test suite fires five identical bookings
at once and asserts exactly one survives. Because the range is half-open, a booking that
ends at 10:00 and one that starts at 10:00 do not clash — same-day handovers work.

```
src/
  app/            routes: (auth) sign-in/up, (app) the signed-in shell
                  fleet · bookings (+ check-out/check-in) · customers · dashboard
  components/     shared UI
  server/
    db/           client.ts (unscoped; auth only) · tenant.ts (scoped; everything else)
    auth/         session (jose cookie) · permissions · dal
    modules/      one folder per feature: service.ts + Zod schema.ts
prisma/           schema, migrations, seed
tests/            isolation + module tests (real Postgres)
e2e/              browser smoke run
```

Roles are Owner, Manager and Staff; `src/server/auth/permissions.ts` is the single place
that says who may do what, and it is checked on the server, not just hidden in the UI.
Staff run the counter and can correct a vehicle's details, but pricing a vehicle, adding
one, and taking one off the fleet belong to managers and owners.

A rental runs `RESERVED` → (hand over keys) → `ACTIVE` → (take it back) → `COMPLETED`.
Each step moves the booking and the vehicle together in one transaction, and odometer
readings cannot go backwards, so the fleet board cannot drift out of step with reality.

Vehicle types are one table plus a JSON `attributes` column. `CATEGORY_FIELDS` in
`src/server/modules/vehicles/schema.ts` is the single source of truth for which extra
fields a category has — the validator and the form are both built from it, so a field
cannot be validated but never shown, or shown but never validated.

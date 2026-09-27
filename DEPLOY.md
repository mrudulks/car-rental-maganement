# Deploying to Railway

Fleetdesk runs as a long-lived Node server holding a Postgres connection pool, which is
why Railway suits it: the app and the database sit in one project on a private network,
with no serverless connection-pooling workaround.

`railway.toml` in the repo root already sets the build, the pre-deploy migration and the
health check. These steps cover what Railway cannot infer.

## 1. Create the project

1. In Railway, **New Project → Deploy from GitHub repo**, and pick this repository.
2. In the same project, **New → Database → Add PostgreSQL**.

Railway builds on the first push. That build will succeed before the database is
attached — nothing in the build touches Postgres — but the app will not serve until
step 2 is done.

## 2. Set the environment variables

On the **app** service, under Variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — reference the database service, do not paste a literal URL |
| `SESSION_SECRET` | A fresh 32-byte secret, **not** the one from your local `.env` |

For hand-over photos and video, also set the four R2 variables below. Leave them unset
and the capture UI stays hidden rather than erroring, so the rest of the app works
without them.

| Variable | Where it comes from |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare dashboard → R2 → account ID |
| `R2_ACCESS_KEY_ID` | R2 → Manage API tokens → create a token with object read and write |
| `R2_SECRET_ACCESS_KEY` | Shown once when the token is created |
| `R2_BUCKET` | The bucket name you created |

Keep the bucket **private**. Files are served through short-lived signed links, so
nothing is reachable by a guessable address.

Generate the secret with:

```bash
openssl rand -base64 32
```

Changing `SESSION_SECRET` later signs everyone out; that is the only effect.

## 3. Deploy

Push to `main`. On each deploy Railway runs, in order:

1. `npm ci` → `postinstall` generates the Prisma client
2. `npm run build`
3. `npx prisma migrate deploy` — applies committed migrations only
4. `npm run start`

`prisma migrate deploy` never generates, resets or drops anything. If a migration fails,
the deploy stops before the new version takes traffic.

Then, under Settings → Networking, **Generate Domain** to get a public URL.

## 4. Create the first account

Open `/signup` on the deployed URL. That creates the organization, its Main branch and
the owner in one transaction.

**Do not run `npm run seed` against the deployed database.** It deletes every
organization, vehicle, booking and customer before inserting demo data. The script
refuses to run against a non-local `DATABASE_URL` unless `SEED_CONFIRM=wipe` is set, so
an accident takes real effort — but the refusal is the only thing standing between a
mistyped command and an empty database.

## Before anyone outside your team uses it

These are not Railway issues; they are gaps in the app, listed here because a public URL
is the point at which they start to matter.

1. **No rate limiting on login.** Nothing slows down repeated password guesses.
2. **No password reset.** Whoever forgets theirs needs the database edited by hand.
3. **No server-side session revocation.** Sessions are seven-day JWTs. Disabling a user
   takes effect on their next request, but an already-issued token cannot be killed.
4. **No backups configured.** Railway can enable Postgres backups; do that before the
   data is worth anything.
5. **No error reporting.** Failures reach the deploy logs and nowhere else.

## Troubleshooting

**Every page returns 500 right after the first deploy.** The migration step did not run
or could not reach the database. Check `DATABASE_URL` is the `${{Postgres.DATABASE_URL}}`
reference, then look at the pre-deploy logs.

**`SESSION_SECRET is not set`.** The variable is missing on the app service. It is read
at request time, so the build will have succeeded regardless.

**Signed in, then immediately signed out again.** `SESSION_SECRET` changed between
deploys, invalidating existing cookies. Sign in again.

**Health check fails.** It requests `/login`, which must answer 200 without a session.
If that page errors, the cause is in the app, not the check.

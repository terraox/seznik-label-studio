# Seznik Admin Panel (SEZ Print Desk)

Same desk functionality as before (Overview, Library, Feedback, Settings), styled with the Seznik admin-panel UI.

```bash
cd admin
cp .env.example .env   # then follow "Desk sign-in" below
npm install
npm run db:deploy      # apply database migrations (prisma/migrations)
npm run dev
```

Open http://localhost:3000

## Desk sign-in

There are no built-in logins. Setup:

```bash
npm run secrets:gen        # prints 4 secrets; paste them into .env
# also set BOOTSTRAP_ADMIN_EMAIL in .env
npm run dev                # the server log prints a one-time password for that email
```

Alternatively set `ADMIN_FIXED_USERNAME` and `ADMIN_FIXED_PASSWORD` in `.env` for a fixed owner
login (re-applied on every start; no one-time password; keep `.env` out of git). The first sign-in
still enrols an authenticator app (TOTP), which is then asked for on every sign-in.

The bootstrap flow's first sign-in forces a new password (12+ characters) and authenticator-app (TOTP) enrolment.
The server refuses to start if `ADMIN_SESSION_SECRET`, `APP_TOKEN_SECRET`, `OTP_HASH_SECRET`
or `SEZ_ADMIN_SECRET` is missing, a placeholder, under 32 characters, or reused.
Admins created by an owner also get a first-login password change and TOTP enrolment.

## Database

Postgres via Prisma. `prisma/schema.prisma` is the source of truth; `docs/database.dbml` is the readable
diagram (paste it into https://dbdiagram.io). Change flow: edit the schema, `npm run db:migrate -- --name what_changed`,
update the .dbml, then `npm run ci` (it fails if the diagram is out of date).

Other scripts: `npm run test:users` (end-to-end accounts / duplicate-number / block tests; see the header of
`scripts/test-users-flow.mts` for the --prep / --cleanup steps) and `npm run ci` (validate, diagram check, typecheck,
secret scan, build).

## Pages

1. **Users** — app accounts, search, block / unblock, blocked numbers
2. **Audit** — who did what (owners)
3. **Overview** — devices, published templates, print counts, CSV export
4. **Library** — templates, clipart, stickers
5. **Feedback** — reviews and suggestions
6. **Settings** — admin roles

## Mobile app auth (separate)

| Route | Purpose |
|-------|---------|
| `POST /api/app/register` | name, mobile, password |
| `POST /api/app/login` | mobile + password |
| `GET /api/app/me` | current app user |
| `POST /api/app/printer` | set purchased printer (`tejas` \| `rudra` \| `josh`) |
| `GET /api/app/config` | public: admin contact, minimum build |
| `GET /api/health` | liveness + database check |

Desk data still lives in `admin/data/store.json` + `admin/data/uploads`. App users live in Postgres via Prisma.

API inventory: http://localhost:3000/swagger

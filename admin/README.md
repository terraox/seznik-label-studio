# Seznik Admin Panel (SEZ Print Desk)

Same desk functionality as before (Overview, Library, Feedback, Settings), styled with the Seznik admin-panel UI.

```bash
cd admin
cp .env.example .env   # set SEZ_ADMIN_SECRET + DATABASE_URL
npm install
npx prisma db push     # mobile app users table
npm run dev
```

Open http://localhost:3000

## Desk sign-in

- Owner: `seznikadmin` / `Seznik01!`
- Editor: `editor@sez.local` / `sez-editor`

(Change these in Settings.)

## Pages

1. **Overview** — devices, published templates, print counts, CSV export
2. **Library** — templates, clipart, stickers
3. **Feedback** — reviews and suggestions
4. **Settings** — admin roles

## Mobile app auth (separate)

| Route | Purpose |
|-------|---------|
| `POST /api/app/register` | name, mobile, password |
| `POST /api/app/login` | mobile + password |
| `GET /api/app/me` | current app user |
| `POST /api/app/printer` | set purchased printer (`tejas` \| `rudra` \| `josh`) |

Desk data still lives in `admin/data/store.json` + `admin/data/uploads`. App users live in Postgres via Prisma.

API inventory: http://localhost:3000/swagger

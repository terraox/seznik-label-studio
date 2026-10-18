# sez-print Backend + Admin Panel: Plan (v2.1)

Status (2026-10-18): **P1.0 secrets, P1.1 backups, and a first slice of P1.2 + P2 + P5 (server and admin desk) are done locally.**
Done: Prisma migrations (baseline + 16 tables), `docs/database.dbml` kept in step by `npm run check:dbml`, OTP and rate limits in Postgres, one-account-per-number (permanent `RegisteredPhone` claim), per-request status + `tokenVersion` check, block / unblock / sign-out-everywhere / pre-block a number, audit log, users CSV export (owner), `/api/app/config`, `/api/health`, local CI (`npm run ci`), 37-check end-to-end test (`npm run test:users`). TOTP is required for every admin including the fixed `seznikadmin` login.
Still open from P1.2/P5: role rename to `superadmin/support/content`, admins into Postgres, mobile blocked screen + `/me` call at startup + `bypassAuth` removal (needs a rebuild), event pipeline (P3 onwards).

## Scope update (owner, 2026-10-18): AWS comes last

1. Everything is built and tested **locally**: existing local Postgres `sez_print`, no Docker, MinIO, LocalStack or AWS account until P10.
2. File storage (catalog SVGs, thumbnails) sits behind a small **storage interface** with two implementations: **local disk** (development, served by the app server) and **S3** (written against the real S3 API, config-driven endpoint and credentials, presigned POST with `content-length-range`; only verified at deploy).
3. **P10 Deploy** (last): Dockerfile, CI image build, Terraform/CDK, ECS Fargate, ALB, RDS, S3, CloudFront, Secrets Manager, the AWS cost sheet (section 2.8), acceptance check 9 (S3 direct URL 403, CloudFront CSP/nosniff headers). Nothing before P10 requires AWS.
4. Until P10 the same security headers (CSP, `nosniff`) are served and tested through the app server.
5. Section 10 below is updated accordingly: **P1.3 (infra on staging) moves to P10**; the cost estimate becomes a P10 deliverable.

Dated 2026-10-18. Supersedes the first draft plan (chat only). Source brief: owner's work plan (R1-R10, acceptance checks 1-10).

---

## 0. Pending from owner

| Item | Needed for | Plan default until answered |
|---|---|---|
| Admin contact (email / phone / WhatsApp) for the blocked screen | P5 | Placeholder in remote config; ships blank-safe |
| Password-hash decision (R1a) | P2 | Hidden: "Password: set, changed <date>", Reset action. Hash never returned. |
| Is the `dev` printer family real customer hardware? | P4 | Treated as real: counted, tagged `sdk_family=dev`, filterable |
| Confirm the read-only findings in section 1, especially the **public repo + leaked credentials** | P1 | P1 does not start |

---

## 1. Read-only pass: results

### 1.1 Repo / secrets (most urgent)

- GitHub repo `zubshaikh808787-commits/sez-print` is **PUBLIC** (owned by a different GitHub account than the git user on this machine).
- The default admin logins (owner and editor accounts) are in history: commit `a67eed0` (README + `admin/src/lib/seed.ts`), plus an earlier unrelated hit in `1310c92`. `a67eed0` is on `origin/dev`, `origin/zub-backup`, `origin/border/stable-baseline` (not on `main`). They are also in the current README.
- The fallback session secrets (dev defaults) are in code since `8974275` / `e7610c3` (same public branches); a hardcoded second admin login (`ADMIN_USER_ID`/`ADMIN_PASSWORD` defaults in `admin-session.ts`) was found during P1.0 as well.
- **MSG91 key: no match in git history.** `admin/.env` is untracked and `MSG91_AUTH_KEY` is set locally. Only `.env.example` is tracked. (Pattern search only, not proof; rotate anyway, per the earlier note.)
- Consequence: treat the admin logins and the dev secret as **compromised**. Rewriting history cannot un-leak a public repo; rotation is the fix. Making the repo private is the owner's call (not mine to do).
- `ADMIN_SESSION_SECRET` is used for both app tokens **and** OTP hashing. Split into separate secrets.
- Repo also holds the vendor printer SDK under `backend/GD985-SDK` (not a server; unrelated to this plan). Licensing of publishing it is the owner's call.

### 1.2 Data (counts only)

| Source | Result |
|---|---|
| Local Postgres `sez_print`, table `AppUser` | **2 users** (printerName: 1 josh, 1 tejas), both have `lastLoginAt` |
| Phone-duplicate dry run (91 prefix) | 0 rows with `91`-prefixed 12-digit numbers; all numbers are 10 digits; 0 groups sharing the last 10 digits. **Nothing changed.** |
| `admin/data/store.json` (gitignored, 23 KB) | admins 2, devices 12, prints 41, templates 8, clipart 6, stickers 6, reviews 8, suggestions 7 |
| Verdict | Looks like **seed/demo data** (`seed.ts` has `sampleParts`; 2 admins = the default accounts; print printers include `dev`, `labelx`, `tez`, `josh`, `td404` evenly). Needs owner confirmation before anything is dropped. Not real user data as far as I can tell. |

### 1.3 Hosting

- **No deployment found.** No Dockerfile / Vercel / Fly / Render / AWS config in repo. `app.json` has `apiUrl: http://localhost:3000`, and `eas.json` sets no API URL env.
- So no installed build can reach a hosted server unless `EXPO_PUBLIC_API_URL` is set as an EAS secret, which I can't see from the repo. **Owner to confirm: has any app build gone to real users with a reachable server?** If not, no real accounts exist and the "old builds" concerns are about the future released build only.

### 1.4 App code

| Question | Finding |
|---|---|
| Shop tap handler | `src/components/shop/product-card.tsx`, `onBuy` -> `openProductUrl(product)`. Product ids are stable strings from bundled `catalog.json`. No detail page, so only one source: `shop_buy`. Emit before the open call. |
| Templates | Hardcoded `TEMPLATES` array in `src/app/(tabs)/template.tsx:223`, instantiated via `createIndustryTemplateDocument` into a `LabelDocument`. Nothing remote. |
| Clipart | `clipart.tsx` uses bundled catalogs (`clipart-catalog`, `clipart-library`, `line-emoji-catalog`) plus user-imported SVGs (`user-clipart-store`, `hydrateUserClipartSvgs`). Custom SVG parser in `src/lib/clipart/parse-svg.ts`. User clipart is already stored as a local copy, so embedding a copy is an existing pattern. |
| Template-origin field on documents | **None.** `LabelDocument` has no `templateId`/origin (the `templateId` in `shipping-editor` is a different feature). Must be added when a document is created from the library. |
| `refreshSession` call sites | **None outside the store itself.** `fetchMe` is never called. The app never re-checks the server after login. (Also: it clears the session on *any* error incl. offline, so wiring it up naively would log offline users out. Fix needed.) |
| Network-state library | **None** (`netinfo`/`expo-network` absent). Adding `@react-native-community/netinfo` is a native module and **needs a rebuild**. Default: do not add; flush on AppState `active`, after each print, on a timer, and after any successful request. |
| `bypassAuth` | Called from `login.tsx:76` and `register.tsx:87`, **not gated by `__DEV__`**. A skip-login path exists in shipped UI. It creates a fake user with token `dev-bypass-token`. It cannot be blocked and produces no tracking. Must be removed or gated to `__DEV__` in the next build. |
| Print choke point | `print.tsx:~2150` (`labelsCompleted += sendCopies; usePrintStatsStore.record(sendCopies)`), per confirmed page. PDF path (`printPdfToThermal`, `print.tsx:~1030`) does **not** record. |

### 1.5 What OLD builds do on 403 / 401

- **Login:** any non-OK response -> `parseError` returns `body.error` -> shown as red text on the login screen; no session is stored. So a `403 { "error": "<message>" }` at login shows the message and does not log in. (Old OTP login path behaves the same.)
- **Refresh:** nothing. Old builds never call `/me` or any authenticated endpoint except `POST /api/app/printer` (only on the select-printer screen). A stored token is never re-validated and its expiry is never checked on the client.
- **Therefore: no response code makes an already-signed-in old build log out.** There is no code path that reads one. This is a fact of the shipped client, not a choice.

---

## 2. Decisions (with the changes from the review applied)

### 2.1 Stack (unchanged from v1, flagged)

- Extend `admin/` (Next.js 15 + Prisma + Postgres). Do not start a second backend.
- Target hosting (built last, P10): **ECS Fargate behind an ALB** (not Lambda), RDS Postgres, S3 + CloudFront, Secrets Manager; `staging` and `prod` separate. Until then everything runs locally.
- Admin auth: keep the current sessions, add **TOTP** and the roles `superadmin / support / content` (mapped from `owner / editor / viewer`). Cognito is the alternative; not chosen (second identity system).
- App tokens: keep the current format (additive claim), and **check the user row on every request**. No separate 15-min/refresh pair (same guarantee, far less client change).
- Move to `prisma migrate` with a baseline of the existing `AppUser` table. Stop using `db push`.
- Move OTP store, OTP throttle and all rate limits to Postgres (shared across tasks).

### 2.2 Change 1: P1 starts with secrets. Nothing deploys to AWS before this.

P1.0 (all local, before any infra):
1. Treat as compromised: all default admin logins, the dev fallback secrets, `SEZ_ADMIN_SECRET`, local MSG91 key (rotate in MSG91 console; owner action).
2. Remove credentials from `README.md` and `seed.ts`. First admin is created from env (`BOOTSTRAP_ADMIN_EMAIL` / one-time generated password printed once, forced change + TOTP enrolment on first login). **No seeded admins in production.**
3. **Production refuses default secrets:** server exits at boot if `ADMIN_SESSION_SECRET`, `APP_TOKEN_SECRET`, `OTP_HASH_SECRET`, `SEZ_ADMIN_SECRET` are missing, equal to a known default, or under 32 chars. Separate secret per purpose.
4. Rotating the app-token secret invalidates all app tokens (fine: 2 local users, no known prod users; confirm per 1.3).
5. Secrets live in AWS Secrets Manager; `.env` stays untracked; add a pre-commit/CI secret scan.
6. Report to owner: public-repo exposure, recommendation to make repo private. Report only; no action.

Gate: owner confirms P1.0 done -> only then P1.1+.

**P1.0 as implemented (2026-10-18)**
- Four separate secrets: `ADMIN_SESSION_SECRET`, `APP_TOKEN_SECRET` (app tokens), `OTP_HASH_SECRET` (OTP hashes and proofs), `SEZ_ADMIN_SECRET` (desk cookie). No fallbacks anywhere. Boot refuses on missing / under 32 chars / placeholder / low variety / reused across purposes (all environments; `next dev` needs them too, because the edge middleware and node routes must agree).
- No seeded admins. First owner from `BOOTSTRAP_ADMIN_EMAIL`, one-time password printed once, forced new password (12+) and TOTP enrolment (RFC 6238, no new dependency, replay-protected). Admins created or reset by an owner get the same forced setup. Pre-existing admins (no `credsVersion`) are switched off at boot.
- Found and fixed beyond the plan: a second hardcoded admin login in `admin-session.ts` (`/api/admin/login`), now off unless `ADMIN_USER_ID` + a 16+ char `ADMIN_PASSWORD` are set; a special-cased username in the desk login route; prefilled usernames in two login forms.
- Secret scan: `scripts/secret-scan.mjs` (`--staged` pre-commit via `.githooks`, `--history`, `--json`), known-leaked values matched by SHA-256.
- Mobile app: **untouched in P1.0** (no rebuild, no refresh needed).

### 2.3 Change 2: backup first, dry-run before migrations

Before the Prisma baseline or any `store.json` migration:
1. `pg_dump` of `sez_print` to a timestamped file (outside the repo, not committed).
2. Copy of `admin/data/store.json` and `admin/data/uploads/` (same).
3. Phone-duplicate dry run: **already run, result in 1.2 (0 problems). Re-run on the real production DB when one exists, report only, change nothing.** The query: count of groups sharing `right(mobile,10)`, plus count of 12-digit `91…` rows.
4. Migration of `store.json`: reviews/suggestions/templates/assets are imported only after owner confirms they are not demo data. Default: **archive, do not import**; delete nothing.

### 2.4 Change 3: old builds cannot dodge a block

What is achievable, stated plainly:

| Case | What I chose | Why |
|---|---|---|
| Old build, **fresh login** or OTP login by a blocked user | `403` with body `{ "error": "<block message + default text>", "code": "USER_BLOCKED" }` | Old build already prints `body.error` on the login screen and stores nothing; new build reads `code`. One body serves both. |
| Old build, **already signed in** | **Cannot be forced out.** Server rejects its `/printer` call (the only one it makes) with `403 USER_BLOCKED` + `error` text (old build shows the text as an error, does not log out). | No old code path logs out on any response. |
| Backstop: **min-app-version** | Builds send `X-App-Version` / `X-App-Build`. **A request without the header is a legacy build.** Server config `min_app_build` + `legacy_cutoff` flag. When on: legacy builds get `426 Upgrade Required` at **login, register and OTP send** with message "Please update the app from the store". | Stops a blocked user from simply reinstalling an old APK and re-registering/logging in. |
| New build | At startup, on foreground and before each flush it calls `/v1/me`; **401 -> logout; 403 USER_BLOCKED -> clear session, show blocked screen**; network error -> **keep session**. Blocked state persists across restarts. | Fixes the `refreshSession` flaw. |
| Remaining gap | A blocked user on an already-signed-in **old build** keeps printing locally and stays tracked as nothing. Their token is revoked server-side (`token_version`) so they cannot sync or use any API. They are only fully shut out once they update or log out. | Honest limit; mitigated by publishing the new build and turning `legacy_cutoff` on after rollout. |

Also in the same release: **remove or `__DEV__`-gate `bypassAuth`** (section 1.4); otherwise a blocked user can skip login.

### 2.5 Change 4: dev printer family and internal accounts

- `dev`-family prints are **not excluded from totals**. They are tagged (`printers.sdk_family = dev`) and the panel has an SDK-family filter on every print screen.
- New `users.is_internal boolean default false` for test/staff accounts. Admin can toggle it per user.
- Panel toggle **"Exclude internal accounts"**: default **ON** for headline cards (flagged; owner can flip default). With the toggle OFF, all totals reconcile to raw SQL over the whole table.
- Nothing is excluded by printer family. Only `is_internal` users, by toggle.
- Acceptance check 4 is run with the toggle OFF (the raw reconciliation) and ON (separately shown).

### 2.6 Change 5: panel footers

Every analytics screen carries a footer:
- `Tracking since <first event received_at, IST>` (per release; older prints are not in the data, no backfill).
- `Counts are labels sent to the printer` (bytes handed to the printer; a jam or empty roll can still be counted).
- App-version mix (builds that report vs not), as a small bar: `v1.0.x n%, no-tracking builds n%` (the last from users whose latest `app_version` predates tracking).

### 2.7 Change 6: printer names

- `printer_connections` / `print_events` keep `printer_name_raw` exactly as the SDK reports it.
- `printers` has `name_raw` (unique), `model_normalised` (auto: strip trailing MAC/hex suffixes, e.g. `TD404-1A2B` -> `TD404`; lowercase key), `sdk_family`, `first_seen_at`.
- **`printer_aliases` table** (admin-editable): `pattern` or exact `name_raw` -> `display_name`, `model_normalised`. Admin can merge/rename; changes are audited. Unique-printer headline counts **distinct `model_normalised` after aliases**, with raw-name count shown beside it.
- Hardware id (hashed) stored when the platform exposes one; "distinct devices" shown only where known.

### 2.8 Change 7: monthly AWS cost estimate (deliverable of P10)

Estimates only, from memory of ap-south-1 list prices (±20%); P1 will re-price with the AWS calculator and attach the result. Idle/low traffic assumed.

| Line | Staging (min) | Prod (min, 1 task) | Prod (HA, 2 tasks) |
|---|---|---|---|
| ALB | ~$20 | ~$20 | ~$22 |
| NAT gateway (1) + data | ~$35 | ~$35 | ~$40 (2 NATs ≈ $70) |
| RDS Postgres (t4g.micro/small, 20 GB) | ~$15 (single-AZ) | ~$18 | ~$35 (Multi-AZ) |
| Fargate (0.5 vCPU / 1 GB) | ~$20 | ~$20 | ~$40 |
| S3 + CloudFront (catalog SVGs, small) | ~$1 | ~$2 | ~$3 |
| Secrets Manager / CloudWatch / ECR / Route 53 | ~$8 | ~$10 | ~$12 |
| **Total / month** | **~$100** | **~$105** | **~$150-185** |

Savings options to evaluate in P10: no NAT (Fargate in public subnets with locked security groups, RDS stays private) saves ~$35 per environment; staging scaled to zero out of hours; share one ALB across staging/prod by host rule. Realistic target: **staging ~$55, prod ~$75-110.**

### 2.9 Change 8: token handling and block delay

**Tokens issued before `token_version` existed:**
- Legacy format: `userId.exp.nonce.sig` (4 parts, no version claim). New format adds a `tv` claim (e.g. `userId.exp.nonce.tv.sig`; parser accepts both).
- A legacy token is valid **only while `users.token_version = 0` and `status = active`**. The first block (or password reset) sets `token_version >= 1`, so every legacy token is rejected from then on (it cannot carry `tv`). Unblock does not restore it: the user logs in again and receives a `tv`-bearing token.
- New-format token valid only if its `tv` equals the row's `token_version` and `status = active`.
- Signing secret rotation (2.2) invalidates all tokens once; accepted.

**Worst-case block delay with the 30 s per-task cache:**
- Each Fargate task caches the user's `status + token_version` for up to **30 s**. A task that cached "active" just before the admin clicks Block can still serve that user for at most **30 s + the length of the in-flight request**. Tasks do not coordinate, so the bound is 30 s from the DB commit regardless of task count.
- Mitigations: cache **only positive ("active") entries**; a blocked result is never cached (so once seen it is final); event-ingestion and `/me` (the calls that matter) read the DB directly, bypassing cache. Resulting worst case: **≤ 30 s for ordinary endpoints, ~0 s for `/v1/events` and `/v1/me`.**
- Offline users: unbounded (until next network call). Stated in the panel's block dialog.

---

## 3. Architecture

```
Expo app ──HTTPS──> ALB ──> Fargate task(s): Next.js (admin/)
                                  ├─ /api/app/*   legacy app auth routes (kept for old builds)
                                  ├─ /v1/*        new app API (events, me, feedback, catalog, config)
                                  ├─ /admin/*     admin API (roles, MFA)  + admin UI (React)
                                  └─ Postgres (RDS, private)  ·  S3 (catalog, private) ← CloudFront (OAC)
```

- An app-user token can never reach `/admin/*`; admin cookies can never reach `/v1/*`. Separate middleware and secrets.
- Public, cached, no-auth: `GET /api/app/config` (contact details, `min_app_build`, `legacy_cutoff`, privacy text version).

## 4. Data model (additions to `AppUser`)

(Names indicative; real migrations are written in P1.)

- **users** (`AppUser` + columns): `status (active|blocked)`, `blocked_at/by`, `block_message`, `block_internal_note`, `token_version int default 0`, `print_count_total bigint`, `last_print_at`, `last_seen_at`, `app_version`, `platform`, `device_model`, `is_internal bool`, `password_updated_at`, `deleted_at`. `mobile` stays digits-only (10-digit India), unique; normalise with one function everywhere.
- **user_status_history**: every block/unblock (admin, message, note, at).
- **printers** (`name_raw`, `model_normalised`, `sdk_family`, `first_seen_at`), **printer_aliases**.
- **printer_connections**: `event_id` unique, `user_id`, `printer_id`, `transport`, `occurred_at`, `received_at`.
- **print_events**: `event_id` unique, `job_id`, `user_id` (nullable after account deletion), `printer_id` **not null**, `source` (`manual_size|template|excel|pdf|photo|scan|serial|other`), `label_width_mm`, `label_height_mm` (document size, rounded 0.1), `template_id`, `template_name_snapshot`, `label_key`, `jobs`, `labels_count`, `ups`, `app_version`, `occurred_at`, `received_at`. Indexes: `(occurred_at)`, `(user_id, occurred_at)`, `(label_key)`, `(printer_id)`.
- **feedback**, **product_clicks** (`product_key`, `product_name_snapshot`, `category`, `source=shop_buy`), **catalog_categories**, **catalog_items** (+ `status draft|published`, `revision`), **catalog_tombstones**, **admin_audit_log**, **otp_codes**, **rate_limits**, **app_config**.
- All times stored UTC; windows computed in `Asia/Kolkata` in SQL.

## 5. Print tracking: rules and edge cases

- **Unit = physical labels dispatched.** `labels = copies x pages x ups` (stickers, not rows; **multi-up recently added: "2 ups" means 2 stickers per row; confirm against `labelsCompleted` in P3**). `jobs` also stored; headline = labels.
- **One event per job, keyed by `job_id`.** `labels_count` increases as each page is confirmed (the existing per-page confirm point); the event is finalised in `finally`. A cancelled/failed job reports what was confirmed. If the app is killed mid-job, the open job is persisted and finalised with the confirmed count on next launch. No confirmation -> no event.
- **Counted paths:** label, excel/bulk, pdf-to-printer (new: currently not recorded locally), photo, scan, serial, reprint from history. **Not emitted:** print-to-PDF/preview/export, calibration and diagnostics screens.
- **Printer required:** emit only if `manager.isConnected` at dispatch and bridge success; event carries printer raw name; server returns `400 PRINTER_REQUIRED` otherwise. Paper-jam/out-of-paper may still count (bytes handed over): footer says so.
- **Source of truth for the label key:** document size as designed, not orientation-swapped paper size (rotated TD-404 jobs count under the label as designed). `manual:{W}x{H}` or `template:{id}:{W}x{H}`. A template-derived document that the user resizes becomes `manual`.
- **Template origin:** add `origin?: { templateId, name }` to `LabelDocument`, set where `TEMPLATES` entries are instantiated; clone/duplicate keeps it; legacy documents without it are `manual`.
- **Delivery:** persistent local queue (cap 2,000; drop clicks before prints), batches of ≤50 to `POST /v1/events`, per-event result (`accepted|duplicate|rejected:<reason>`), backoff with jitter, single-flight flush, triggers: AppState active, after each finished job, 60 s timer, after any successful request.
- **Server:** `INSERT … ON CONFLICT (event_id) DO NOTHING`; `print_count_total` incremented only for rows inserted, same transaction. Limits: `labels 1..10,000`, size 5..300 mm. Clock skew: client sends its "now" in the batch header, server corrects; future-dated or >30 days old rejected and logged. Blocked user -> `403 USER_BLOCKED`, client clears queue.
- **Account switching:** flush before logout; if a different user logs in, the previous user's remaining queue is purged (documented loss).
- **`bypassAuth`/dev-bypass:** removed/gated; no events from it.
- **No backfill:** old local `print-stats-store` lifetime counts are not uploaded (unverifiable). Panels say "tracking since <date>".
- Nightly job: `print_count_total` vs `SUM(labels_count)`, drift alert.
- Windows (IST): 7 days = rolling 7x24 h; month = 00:00 on the 1st IST to now; lifetime = all. Chart: last 30 IST days, zero-filled. Rollup table only when queries get slow.

## 6. Admin panel screens

Users (R1, R6) · Printers (R2, with alias editor) · Print totals (R3) · Most printed labels (R5) · Dashboard header · Feedback (R7) · Shop clicks (R8) · Catalog (R10) · Audit log · Admins. Server-side pagination (keyset), phone search on normalised digits, CSV export (superadmin only; formula-injection escaped; audited; no password data). Role redaction **in the API**: `content` receives no phone numbers; `support` cannot export. Footer (2.6) on every analytics screen. Existing `admin/src/panel/*` components are reused only after checking they're wired; many look like templates from another project.

## 7. Block / unblock (R9)

- Admin dialog: `block_message` (user-visible, length-capped, escaped in the panel) and `block_internal_note` (admin-only); unblock with optional note; full history on the user page; audit rows with before/after.
- Enforcement: status read on every authenticated request (cache rules, 2.9); block bumps `token_version`.
- Login (password and OTP): credentials verified first, then status; `403 USER_BLOCKED` with message. Register with a blocked number returns "already exists" and changes nothing. A blocked user cannot delete the account to dodge the block (phone is retained as a tombstone).
- App: blocked screen with message + "Contact admin" using remote-config details; state persists offline across restarts; login error for blocked: *"Your account has been blocked. Please contact the admin to resolve this."*
- Stated limits: offline blocked users keep printing locally; old signed-in builds cannot be forced out (2.4). Optional hardening, default off: require server check-in every N days.

## 8. Feedback, clicks, catalog (summary; details as in v1)

- **Feedback:** new in-app screen (none exists today); 1-5 stars required; categories; ≤1,000 chars, control characters stripped; 5/day/user; idempotent `event_id`; blocked -> 403. Admin: filters, distribution, status + note.
- **Clicks:** emit in `product-card.tsx` `onBuy` before `openProductUrl`, via the same queue; `product_key = product.id`. Admin: total, unique users, 7 days, month, daily trend.
- **Catalog:** S3 private bucket + CloudFront OAC, immutable hashed keys, `staging/` -> `catalog/`; **presigned POST** with `content-length-range` (PUT cannot enforce size); server sanitises (DTD/entities off, scripts/`on*`/external refs/foreignObject stripped, depth + path caps, small data-image allowance) **and validates against the app's own `parse-svg.ts` subset**; thumbnails via resvg/sharp; CSP + `nosniff` response headers; soft delete + 30-day lifecycle; draft/published; `If-Match` on edits; duplicate detection by hash; category delete blocked while non-empty. Delta sync by server **revision number** (not timestamps), tombstones kept ≥90 days, older clients full-resync. App embeds a copy of the SVG in the label (existing user-clipart pattern); the bundled library stays as offline fallback. Templates v1 = locked graphic layer that sets the label size (no importer exists).

## 9. Security / privacy / ops

MFA for all admins; audit log for every admin write and export; phones masked in logs (last 4); KMS-encrypted RDS in private subnets; TLS everywhere; shared rate limits (OTP send per phone, per IP and a global SMS-cost cap; login; events; feedback); account deletion anonymises events (`user_id` NULL) so totals stay stable; privacy-policy line + in-app consent text; RDS PITR 14 days + restore test (P9); structured logs, error alerts, ingestion-success dashboard; `staging`/`prod` separate DBs and buckets; app `apiUrl` per EAS profile (HTTPS, never `localhost`); CORS tightened on `/admin`.

## 10. Phases and gates

| Phase | Scope | Gate / evidence |
|---|---|---|
| **P1.0** | Secrets (2.2): rotate, remove from README/seed, production refuses defaults, split secrets, secret scan | Owner confirms. **No AWS before this.** |
| **P1.1** | Backups (2.3): `pg_dump`, `store.json` copy, duplicate-phone dry run on real DB | Files exist + report |
| **P1.2** | Prisma migrate baseline, OTP/throttle/rate-limit to Postgres, admin roles (`superadmin/support/content`), health check, local CI script (typecheck + build + secret scan) | Tests + curl output |
| **P2** | `users` columns, token format + per-request check, `/v1/me`, `/config`, min-version, user list/detail | Real rows in panel |
| **P5 (pulled forward)** | Block/unblock, blocked screen, refresh fix, `bypassAuth` removal | Device test: logged-in, offline, fresh login, old-build login; worst-case delay measured |
| **P3** | Event queue, `/v1/events`, `print.tsx` tracking, PDF path, template origin field | Real prints = rows; acceptance 1-3 |
| **P4** | Connections, printers + aliases, totals, label ranking, header, footers | Acceptance 4-5 (toggle OFF reconciles to raw SQL) |
| **P6** | Feedback | Device submission appears in panel |
| **P7** | Shop clicks | Taps appear as counts |
| **P8** | Catalog | SVG uploaded in panel appears in app without an update; acceptance 7-9 |
| **P9** | Exports, audit review, local restore test (`pg_dump`/restore), ingestion load test | Restore + load numbers; acceptance 10 |
| **P10 Deploy** | Dockerfile, CI image build, Terraform/CDK, Fargate, ALB, RDS, S3, CloudFront, Secrets Manager, cost sheet, S3 adapter verified against real S3 | Acceptance 9; admin logs in on staging with MFA; cost sheet |

Every phase leaves the app working. Mobile phases note **rebuild vs refresh** (anything touching native modules or `app.json` needs a rebuild; JS-only changes need a refresh).

## 11. Acceptance mapping

1 -> P3 · 2 -> P3 · 3 -> P3 · 4,5 -> P4 · 6 -> P5 · 7,8,9 -> P8 · 10 -> P9 (roles built in P1.2, verified P9).

## 12. Risks / things I could not verify

- Whether any released build reaches a hosted server (1.3).
- `store.json` content judged demo from structure only.
- AWS prices are estimates until re-priced in P10.
- Public-repo exposure cannot be reversed by code; owner decides repo visibility.
- Multi-up counting rule and `labelsCompleted` semantics to be confirmed in P3.

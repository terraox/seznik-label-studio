# Admin panel: task list

Built one at a time, in this order. A task is crossed off (`[x]`) only after it was run and its evidence is written next to it.
Local only (no AWS until the last group). Source plan: `BACKEND_ADMIN_PLAN.md`. Diagram: `admin/docs/database.dbml`.

Rules for every task: schema change -> migration + `database.dbml` updated -> `npm run ci` green -> a check run against the real server.

## A. Housekeeping

- [x] **A1. Remove the Swagger link from the admin page.** Files stay in `src/app/swagger` and `src/app/api/openapi`. Page is still reachable at `/swagger` (now requires sign-in).

## B. Access control

- [x] **B1. Roles `superadmin / support / content`** with a permission matrix enforced in the API (content: catalogue only and no phone numbers; support: view and block, no export; superadmin: everything). Existing `owner/editor/viewer` records are migrated.
- [x] **B2. Admin accounts into Postgres** (with TOTP, roles, audit link), importing the current `store.json` admins.

## C. Data intake (server)

- [x] **C1. Event intake `POST /v1/events`** (batches of up to 50, idempotent by `eventId`, per-event result, clock-skew and age limits, blocked users refused). Handles: print job, printer connection, product click, feedback.
- [x] **C2. Printer registry:** raw name, normalised model, SDK family, grouped by Bluetooth-name prefix in code (`lib/printer-line.ts`).
- [x] **C3. Counter integrity:** `printCountTotal` kept equal to the sum of print events; a reconciliation script reports drift.

## D. Screens

- [x] **D1. Printers screen:** unique printers, users per printer, connections, first/last seen.
- [x] **D2. Print totals:** lifetime / last 7 days / this month (IST), jobs vs labels, 30-day chart, internal-accounts toggle.
- [x] **D3. Most printed labels:** `50 x 30 mm` vs `50 x 30 mm · template name`, top 20, windows.
- [x] **D4. Dashboard header and footers:** total/active/blocked users, unique printers, average rating, new users; "tracking since", "labels sent to printer", app-version mix.
- [x] **D5. User detail extras:** printers used, recent prints, feedback and block history in the drawer; last-7-days prints column.
- [x] **D6. Feedback screen** (ratings 1-5, filters, summary, status and note).
- [x] **D7. Shop clicks screen** (per product totals, unique users, 7 days, month, daily trend).

## E. Catalogue (clipart and templates)

- [x] **E1. Storage interface** with local-disk and S3 implementations (S3 verified only at deploy).
- [x] **E2. SVG sanitiser and validator** (scripts, event attributes, external references, size, app-parser subset).
- [x] **E3. Categories and items API** (create, rename, move, replace, soft delete, draft/published).
- [x] **E4. Catalogue screen** (upload, preview, search, rename, delete).
- [x] **E5. App sync API** `GET /v1/catalog?since=` with deleted ids.

## F. Mobile app (needs an app rebuild; separate from the admin work)

- [ ] **F1. Event queue + emit print jobs and printer connections** from the single print path.
- [ ] **F2. Blocked screen, session check at startup, remove skip-login, send app version headers.**
- [ ] **F3. Feedback screen.**
- [ ] **F4. Shop tap events.**
- [ ] **F5. Catalogue download and offline cache.**

## G. Last (needs AWS)

- [ ] **G1. Deploy** (also: encrypt authenticator keys at rest): Docker, Terraform, Fargate, RDS, S3, CloudFront, Secrets Manager, cost sheet, direct-S3-403 and CSP header checks.

---

## Evidence log

- **A1** (2026-10-18): nav link removed from `components/shell.tsx`; `/swagger` and `/api/openapi` removed from the public-path list in `middleware.ts`; folders untouched; typecheck ok.
- **B1** (2026-10-18): `lib/permissions.ts` holds the single permission table (superadmin / support / content, plus a read-only `viewer`, kept from the old role). Every API route uses `requirePermission(...)`; old stored names are mapped (owner -> superadmin, editor -> support) and rewritten at boot. Phone numbers: content has no user access at all; viewer sees masked numbers and cannot search by number; support and superadmin see full numbers. Test (`npm run test:users`) grew to 43 checks, all passing, including content/viewer/support restrictions.
- **B2** (2026-10-18): new `AdminAccount` table (migration `admin_accounts`), `AdminAuditLog.adminId` now a foreign key to it. Sign-in, authenticator setup, team list/create/edit and guards all read Postgres. Boot moved the 6 accounts from `store.json` (left with an empty admin list); pre-rotation accounts were imported switched off; `seznikadmin` kept as super admin. Diagram updated (`AdminAccount` is now [BUILT]); `check:dbml` ok. The authenticator key is still stored as plain text in the table; encrypting it is added to task G1.
- **C1** (2026-10-18): `POST /api/v1/events` (`lib/events.ts`). Types: `print`, `printer_connected`, `product_click`, `feedback`. Batches up to 50 (51 -> 413), per-event result `accepted | duplicate | rejected(reason)`, idempotent by `eventId` (6 parallel sends of one event stored once), no printer -> `400 PRINTER_REQUIRED`, device clock corrected from `sentAt` (a phone 2 h slow lands within seconds of the true time), future / 30-day-old rejected, blocked user -> 403, label key `manual:50x30` / `template:{id}:50x30`, counter bumped in the same transaction as the insert. `npm run test:events`: 24 checks passed.
- **C2** (2026-10-18): printer registry (`lib/printer-registry.ts`): raw name kept, device suffix stripped (`TD404-77AF` -> `TD404`), SDK family guessed. Alias rules `POST/GET /api/printer-aliases`, `DELETE /api/printer-aliases/:id` (new permission `printers.edit`: superadmin + support) rename/merge existing printers and apply to printers that connect later; deleting a rule reverts them. 6 checks in `npm run test:analytics`.
- **C3** (2026-10-18): `npm run reconcile` compares every user counter with the sum of their print events (exit 1 on drift, `--fix` repairs). Test tampers a counter, sees the drift, repairs it.
- **D1** (2026-10-18): `/printers` screen + `GET /api/printers` (models grouped after alias rules: device names, users, connections, labels, first seen, last connected, SDK-family filter, internal toggle) and `/api/printers/users` (who uses a model; numbers masked for roles without phone access). Alias editor on the same page.
- **D2** (2026-10-18): `GET /api/stats/prints`: lifetime / rolling 7 days / calendar month from 00:00 on the 1st India time (boundary checked: `2026-09-30T18:30:00Z`), jobs beside labels, 30 zero-filled India-time days; bar chart on Overview.
- **D3** (2026-10-18): `GET /api/stats/labels`: top-N with `50 x 30 mm` vs `50 x 30 mm · Template name`, rotated size is its own row, 7d / month / lifetime windows. The template name is the latest name seen in print events; it will switch to the live catalogue name when E3 exists.
- **D4** (2026-10-18): `GET /api/stats/summary` header cards (total / active / blocked users, new in 7 days, unique printer models, labels printed, average rating) and a shared footer on Overview, Printers and Shop: "Tracking since <date>", "labels sent to a connected printer" wording, app-version mix. "Exclude internal accounts" toggle on each screen.
- **D5** (2026-10-18): user drawer now shows printers used, recent prints (newest first), feedback, last-7-day labels; users table has a 7-days column.
- **D6** (2026-10-18): `/feedback` rebuilt on the real `Feedback` table: `GET /api/feedback` (rating, category, status, text, sender name/number, date range, internal toggle, paging, 1-5 distribution) and `PATCH /api/feedback/:id` (status + note, audited). Roles: content sees no sender; viewer sees name with masked number; support/superadmin full. The old demo reviews/suggestions API still exists but the screen no longer uses it.
- **D7** (2026-10-18): `/shop` screen + `GET /api/stats/shop` (clicks, distinct people, 7 days, month, daily trend per product).
- Tests for C2, C3 and D1-D7 live in `scripts/test-analytics-flow.mts` (`npm run test:analytics`): 48 checks, expected values computed in JavaScript from the stored rows, all passing.
- **E1** (2026-10-18): `lib/storage/` (`FileStorage` interface; `LocalStorage` on disk under `admin/data/catalog`, `S3Storage` written against the real AWS SDK; chosen by `STORAGE_DRIVER`). Unsafe keys (`..`, absolute paths, odd characters) refused. `GET /api/catalog-files/...` serves files with `nosniff` + sandbox CSP, published files cached forever, waiting uploads need a session. S3 checked offline only: the presigned POST policy carries `content-length-range 1..500000`, the exact content type, the bucket, a `staging/<uuid>.svg` key and a 5-minute expiry; real-bucket checks (direct S3 403, CloudFront headers) stay in G1.
- **E2** (2026-10-18): `lib/catalog/sanitize-svg.ts` (allowlist, not blocklist). Removes scripts, event attributes (any case), foreignObject/iframe, `<style>`, external and `javascript:` links, external paint, editor leftovers; keeps local `#` references; embedded pictures only as small png/jpeg data URIs (decision: allowed up to 150 KB, otherwise removed). Refuses DOCTYPE/entity bombs, non-SVG, broken XML, over 500 KB, over 20 levels deep, over 5000 elements, no size, binary, and files the app could not draw at all (checked with the app's own `parse-svg.ts`). Reports what the app ignores (transform, gradients, text). Size units converted to mm. Thumbnails via resvg. Before/after of a hostile file is printed by the test. 22 checks.
- **E3** (2026-10-18): `/api/catalog/uploads` (multipart, cleans and stages, reports removed/ignored/duplicate), `/api/catalog/uploads/presign` (S3 direct upload; `{direct:false}` locally), categories (create/rename/delete, name unique per kind, delete blocked while items exist), items (publish or draft, edit with `If-Match` revision, move within a kind, replace = new version and new hashed address with the old one kept, soft delete + tombstone). Every write audited. Revision counter lives in `AppConfig` (works on any database).
- **E4** (2026-10-18): `/catalog` screen: Clipart / Templates tabs, category list with counts (add, rename, delete), upload review cards (preview, name, category, template size, removed items, warnings, duplicate notice, Publish / Save as draft), thumbnail grid with search and status filter, item drawer (rename, move, size, publish/unpublish, replace picture, delete). Uses the server upload route in both drivers; the browser-to-S3 route is available through `/api/catalog/uploads/presign` for when it is deployed. Checked in a real Chrome (signed in, tabs, empty states render, no page errors) on /overview /users /printers /feedback /shop /catalog; flows beyond the empty states (upload review cards, drawer) are covered by the API tests, not clicked through.
- **E5** (2026-10-18): `GET /api/v1/catalog?since=<revision>`: published items changed after that revision, ids to remove (deleted or unpublished), the full category list, and `fullResync` when the client is older than the 90-day deletion history. Drafts never leave the server; blocked users get 403. Tests for E1-E3 and E5 are in `scripts/test-catalog-flow.mts`: 52 checks, all passing. Saved labels keep working after a delete because the app will embed a copy of the SVG (task F5); the server keeps old files.

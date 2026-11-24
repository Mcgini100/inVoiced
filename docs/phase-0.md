# Phase 0: safe and buildable

Branch `phase-0-foundation`. Goal: remove every blocker to putting this in front of a real user, without changing what the product does.

## What changed

**Accounts and tenancy**
- Phone-number sign-in with a 6-digit code (5 minute life, 5 guesses, 3 requests per 10 minutes per phone). Codes are stored as HMACs; sessions as SHA-256 hashes in an HTTP-only, SameSite=Lax cookie (Secure in production).
- Each phone number gets its own business on first sign-in. All ledger access goes through `requireLedger()` and a `BusinessRepo` bound to that business, so a query cannot reach another business's rows.
- The hard-coded `default_user` is gone.

**Voice endpoint** (`POST /api/captures`, was `/api/process-audio`)
- Requires a session (401 otherwise), same-origin check, 20 requests per minute per user, a daily cap per business (`CAPTURE_DAILY_LIMIT`), 10 MB limit, audio MIME allow-list.
- Model output is validated with Zod. Only allow-listed fields can be written; unknown keys are dropped; amounts must be positive.
- The recorder asks the browser which format it records (webm on Chrome/Android, mp4 on Safari/iOS) and sends the real type. Recording stops itself after 60 seconds.
- Internal error text is no longer sent to the browser.

**Money**
- Amounts are integer cents (`BIGINT`); rates are `DECIMAL(18,6)`. All arithmetic is in `src/lib/money.ts` with half-even rounding and no floating point.
- An exchange stores both sides when it is created. Changing the rate later does not change history. The silent fallback rate of 25 is gone: an exchange needs a rate, and "My rate" starts empty.
- Deleting marks an entry VOID (kept, with an audit record) instead of removing the row. Every create, edit, void and rate change writes to `AuditLog`.
- The rate is labelled "My rate", not "street rate".

**Infrastructure**
- Postgres with a real migration (`prisma/migrations/`). One shared Prisma client.
- `Dockerfile`, `docker-compose.yml` (db, migrate, app), `deploy/nginx.conf.example`, `/api/health`, JSON logs.
- GitHub Actions: migrations, schema drift check, typecheck, lint, tests against Postgres, build, then `docker compose up` from a fresh clone with a smoke test.
- `scripts/import-sqlite.ts` brings prototype data across.

**Code health**
- Typecheck and lint are clean (were 1 type error that broke the build, 8 lint errors).
- The 549-line page is split into components; no `any`; no `alert`/`confirm`.
- Edit and delete are always visible with 48 px touch targets (were hover-only).
- "Add by hand" form added, so the app works with no voice key and when voice fails.
- Removed: `check_css.js`, `public/test.css`, `page.module.css`, starter SVGs, the unused offline store, zustand, dead `handleTransfer`.
- Fonts are system fonts for now (the Google Fonts download at build time is gone); the redesign picks self-hosted faces.
- Added methods OneMoney and Omari; fixed the "INNSBUCKS" spelling (the import maps old rows).

## How it was verified

| Check | Where it ran | Result |
| --- | --- | --- |
| Migration SQL applies cleanly | local Postgres 16 | pass |
| Unit tests: money, sign-in, ledger rules, tenancy isolation, voice validation, import mapping | local, in-memory store | 46 pass |
| Typecheck, lint, production build | local, with a stand-in for the generated Prisma client | pass |
| Click-through at 360 px: sign-in, wrong code, rate, add, bad amount, exchange, edit, delete, reload, sign-out | local headless Chrome, in-memory store | pass |
| 401 for capture without / with forged session, 403 cross-origin, `/` redirects to `/login` | local | pass |
| Prisma client generation, migrations via Prisma, schema drift, the same ledger and tenancy tests against Postgres, Docker build, compose smoke test | **GitHub Actions only** | see the CI run on this branch |

Prisma's engine cannot be downloaded in the environment this phase was written in, so `src/server/repo/prisma.ts` and the migration were written without running Prisma locally. CI is the proof for that layer; treat a red CI run as blocking.

## Still open (not done in this phase)

- **Real code delivery.** Only the `console` provider exists. OWNER INPUT: SMS or WhatsApp provider. The email fallback and the 4-digit app PIN from the brief are not built.
- **Voice models are unchanged** (`whisper-1`, `gpt-4o-mini`), now configurable by env. They are deprecated upstream; Phase 1 replaces them and adds the draft/confirm step. Until then a voice entry is still saved without confirmation, and a "correction" still edits the last entry directly (now validated and audited).
- No stored audio or object storage yet (Phase 1), so MinIO is not in compose.
- Wallets, ZAR, same-currency transfers, credit book, reports, statements, offline queue, redesign: Phase 2.
- Old rate-limit rows, used codes and expired sessions are not cleaned up yet; add a daily job.
- A user has exactly one business; staff accounts come later.
- The audio duration cap is enforced in the browser and by file size, not by decoding the audio on the server.

# inVoiced

Voice-to-ledger bookkeeping for Zimbabwe's multi-currency economy. Say "sold two bags of maize for twenty US on EcoCash" or "paid 150 bonds for transport" and it lands in a USD / ZiG ledger. Entries can also be added by hand, so the app is usable without a voice key.

**Status:** Phase 0 (safe and buildable) of the plan in `docs/`. See [`docs/phase-0.md`](docs/phase-0.md) for what changed, what is verified and what is still open.

## Run it

Requirements: Docker, or Node.js 22.13+ with a Postgres 16 database.

### With Docker

```bash
cp .env.example .env
# set AUTH_SECRET in .env:  openssl rand -base64 48
docker compose up --build
```

Open http://localhost:3000. With `OTP_PROVIDER=console` in `.env`, sign-in codes are printed in the app logs (`docker compose logs app`). Leave it empty and sign-in is refused, which is the safe default for a public server until a real SMS/WhatsApp provider is added.

### Without Docker

```bash
npm ci
cp .env.example .env          # set DATABASE_URL and AUTH_SECRET
npx prisma migrate deploy     # creates the tables
npm run dev                   # http://localhost:3000
```

In development the sign-in code is shown on the sign-in screen. The microphone needs `localhost` or HTTPS.

### Bring over data from the SQLite prototype

```bash
npm run import:legacy -- prisma/dev.db 0771234567
```

Copies the old transactions into the account for that phone number. Rows it cannot map safely (for example a transfer with no saved rate) are listed and skipped.

## Checks

```bash
npm run typecheck
npm run lint
npm test                      # set TEST_DATABASE_URL to also run the suite against Postgres
npm run build
```

## How it is put together

```
Browser (Next.js App Router, React 19, Tailwind)
   │ server actions (sign-in, entries, exchange, rate)      │ POST /api/captures (audio)
   ▼                                                        ▼
src/app/actions.ts ── session + Zod + rate limits ── src/app/api/captures/route.ts
   ▼                                                        ▼
src/server/services/   auth.ts · ledger.ts · capture.ts   (all business rules, no framework code)
   ▼
src/server/repo/       types.ts (interface) · prisma.ts (Postgres) · memory.ts (tests)
   ▼
Postgres via Prisma    prisma/schema.prisma · prisma/migrations/
```

| Path | Role |
| --- | --- |
| `src/lib/money.ts` | All money arithmetic: integer cents, half-even rounding, rate conversion |
| `src/lib/domain.ts` | Currencies, methods and the shared types |
| `src/server/context.ts` | Session lookup; `requireLedger()` is the only way to reach ledger data |
| `src/server/repo/` | Every ledger query is bound to one business |
| `src/server/services/` | Sign-in codes and sessions, ledger rules, voice pipeline |
| `src/server/ai/openai.ts` | Transcription and extraction; model names come from env |
| `src/components/` | UI |
| `deploy/nginx.conf.example` | Reverse proxy with TLS |

## Environment

See [`.env.example`](.env.example). `DATABASE_URL` and `AUTH_SECRET` are required; everything else is optional.

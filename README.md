# inVoiced

Voice-to-ledger bookkeeping for Zimbabwe's multi-currency economy. Press the mic, say something like
*"sold two bags of maize for twenty US on EcoCash"* or *"paid 150 bonds for transport"*, and inVoiced
transcribes it, extracts a structured transaction and adds it to a USD / ZiG (ZWG) ledger.

## What it does

- **Voice capture**: records audio in the browser (`MediaRecorder`) and posts it to `/api/process-audio`.
- **Transcription**: OpenAI Whisper (`whisper-1`).
- **Structured extraction**: GPT-4o-mini in JSON mode turns the transcript into
  `{type, context, amount, currency, method, description}`. The prompt maps local terms
  ("bonds", "RTGS", "Zim dollars" → ZWG) and payment methods (EcoCash, InnBucks, bank/swipe, cash).
- **Voice corrections**: the last transaction is passed as context, so *"change that last one to USD"*
  updates the previous entry instead of creating a new one.
- **Multi-currency balances**: separate USD and ZWG balances; transfers between them use the street
  (parallel market) rate saved with each transaction, and the rate is editable in the UI.
- **Ledger management**: recent transactions list with inline edit and delete, manual transfer form,
  business vs personal tagging, light/dark theme.

## Architecture

```
Browser (Next.js App Router, React 19, Tailwind)
  │  mic audio (webm)                 server actions (list, balances, edit, delete, transfer, rate)
  ▼                                          │
POST /api/process-audio ─────────────────────┤
  │ 1. Whisper  → transcript                  │
  │ 2. GPT-4o-mini (JSON mode) → transaction  │
  │    or correction of the last one          │
  ▼                                          ▼
Prisma ORM ──────────────► SQLite (Transaction, UserSettings)
```

| Path | Role |
|---|---|
| `src/app/page.tsx` | Single-page UI: recorder, balances, transfer form, transaction list |
| `src/app/api/process-audio/route.ts` | Whisper transcription + LLM extraction + DB write |
| `src/app/actions.ts` | Server actions for reads, balances, edits, transfers, settings |
| `prisma/schema.prisma` | `Transaction` and `UserSettings` models |

## Setup

Requirements: Node.js 20+, an OpenAI API key.

```bash
git clone https://github.com/Mcgini100/inVoiced.git
cd inVoiced
npm ci
cp .env.example .env          # then put your OpenAI key in .env
npx prisma db push            # creates prisma/dev.db from the schema
npm run dev                   # http://localhost:3000
```

Microphone access needs `localhost` or HTTPS.

### Environment variables (`.env.example`)

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Whisper transcription and GPT-4o-mini extraction |
| `DATABASE_URL` | Prisma SQLite connection string, e.g. `file:./dev.db` |

The local database (`prisma/dev.db`) is git-ignored; each developer creates their own with `npx prisma db push`.

## Tech stack

Next.js 16 (App Router, server actions) · React 19 · TypeScript · Tailwind CSS · Prisma 5 + SQLite ·
OpenAI Node SDK (Whisper, GPT-4o-mini) · Zustand · lucide-react

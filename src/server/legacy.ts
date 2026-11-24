/** Maps rows from the prototype's SQLite database to the phase-0 shape. Pure, so it can be tested. */
import { CONTEXTS, CURRENCIES, type Currency, type Method, type TxContext, otherCurrency } from "@/lib/domain";
import { convertMinor, normaliseRate, toMinor } from "@/lib/money";
import type { NewTransaction } from "./repo/types";

export interface LegacyRow {
  id: string;
  type: string;
  context: string;
  amount: number;
  currency: string;
  method: string;
  description: string | null;
  streetRate: number | null;
  /** SQLite stores Prisma DateTime as epoch milliseconds (or an ISO string in some versions). */
  createdAt: number | string | bigint;
}

export type Mapped = { ok: true; data: NewTransaction } | { ok: false; reason: string };

const METHOD_MAP: Record<string, Method> = { CASH: "CASH", ECOCASH: "ECOCASH", INNSBUCKS: "INNBUCKS", INNBUCKS: "INNBUCKS", BANK: "BANK" };

export function mapLegacyRow(row: LegacyRow): Mapped {
  try {
    if (!(CURRENCIES as readonly string[]).includes(row.currency)) return { ok: false, reason: `unknown currency ${row.currency}` };
    const currency = row.currency as Currency;
    const method = METHOD_MAP[row.method] ?? "CASH";
    const context: TxContext = (CONTEXTS as readonly string[]).includes(row.context) ? (row.context as TxContext) : "PERSONAL";
    const amountMinor = toMinor(row.amount);
    const rate = row.streetRate != null && row.streetRate > 0 ? normaliseRate(row.streetRate) : null;
    const createdAt = new Date(typeof row.createdAt === "bigint" ? Number(row.createdAt) : row.createdAt);
    if (Number.isNaN(createdAt.getTime())) return { ok: false, reason: "unreadable date" };
    const base = { context, amountMinor, currency, method, description: row.description, rate, source: "IMPORT" as const, transcript: null, createdById: null, createdAt };

    if (row.type === "INCOME" || row.type === "EXPENSE") {
      return { ok: true, data: { ...base, type: row.type, toCurrency: null, toAmountMinor: null } };
    }
    if (row.type === "TRANSFER") {
      // The prototype silently assumed 25 when no rate was saved. We refuse to guess.
      if (!rate) return { ok: false, reason: "transfer has no saved rate" };
      const toCurrency = otherCurrency(currency);
      return { ok: true, data: { ...base, type: "TRANSFER", toCurrency, toAmountMinor: convertMinor(amountMinor, currency, toCurrency, rate) } };
    }
    return { ok: false, reason: `unknown type ${row.type}` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "invalid row" };
  }
}

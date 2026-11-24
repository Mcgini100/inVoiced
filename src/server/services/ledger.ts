import { type DashboardData, type Transaction, otherCurrency } from "@/lib/domain";
import { AppError } from "@/lib/errors";
import { MoneyError, convertMinor, normaliseRate, toMinor } from "@/lib/money";
import type { BusinessRepo, TransactionPatch } from "../repo/types";
import type { EditInput, EntryInput, TransferInput } from "../schemas";

export interface LedgerCtx {
  repo: BusinessRepo;
  userId: string;
}

export const PAGE_SIZE = 20;

/** Turns arithmetic/parse failures into user-facing validation errors. */
function money<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof MoneyError) throw new AppError("VALIDATION", err.message);
    throw err;
  }
}

export async function getDashboard(ctx: LedgerCtx, cursor?: string | null): Promise<DashboardData> {
  const [business, balances, page] = await Promise.all([
    ctx.repo.getBusiness(),
    ctx.repo.balances(),
    ctx.repo.listTransactions({ limit: PAGE_SIZE, cursor }),
  ]);
  return { business, balances, transactions: page.items, nextCursor: page.nextCursor };
}

export async function setMyRate(ctx: LedgerCtx, input: string | number | null): Promise<void> {
  const before = (await ctx.repo.getBusiness()).myRate;
  const rate = input === null || input === "" ? null : money(() => normaliseRate(input));
  await ctx.repo.setMyRate(rate);
  await ctx.repo.audit({ userId: ctx.userId, action: "RATE_SET", entity: "Business", entityId: ctx.repo.businessId, before: { myRate: before }, after: { myRate: rate } });
}

export async function createEntry(
  ctx: LedgerCtx,
  input: EntryInput,
  meta: { source: "MANUAL" | "VOICE"; transcript?: string | null } = { source: "MANUAL" },
): Promise<Transaction> {
  const amountMinor = money(() => toMinor(input.amount));
  const { myRate } = await ctx.repo.getBusiness();
  const tx = await ctx.repo.createTransaction({
    type: input.type,
    context: input.context,
    amountMinor,
    currency: input.currency,
    method: input.method,
    description: input.description || null,
    rate: myRate,
    toCurrency: null,
    toAmountMinor: null,
    source: meta.source,
    transcript: meta.transcript ?? null,
    createdById: ctx.userId,
  });
  await ctx.repo.audit({ userId: ctx.userId, action: "TX_CREATE", entity: "Transaction", entityId: tx.id, after: tx });
  return tx;
}

/** A currency exchange. Both legs are fixed at creation; nothing is derived at read time. */
export async function createTransfer(
  ctx: LedgerCtx,
  input: TransferInput,
  meta: { source: "MANUAL" | "VOICE"; transcript?: string | null } = { source: "MANUAL" },
): Promise<Transaction> {
  const amountMinor = money(() => toMinor(input.amount));
  const rate = money(() => normaliseRate(input.rate));
  const toCurrency = otherCurrency(input.fromCurrency);
  const toAmountMinor = money(() => convertMinor(amountMinor, input.fromCurrency, toCurrency, rate));
  if (toAmountMinor <= 0) throw new AppError("VALIDATION", "That amount is too small to exchange at this rate.");
  const tx = await ctx.repo.createTransaction({
    type: "TRANSFER",
    context: "PERSONAL",
    amountMinor,
    currency: input.fromCurrency,
    method: input.method,
    description: input.description || "Currency exchange",
    rate,
    toCurrency,
    toAmountMinor,
    source: meta.source,
    transcript: meta.transcript ?? null,
    createdById: ctx.userId,
  });
  await ctx.repo.audit({ userId: ctx.userId, action: "TX_CREATE", entity: "Transaction", entityId: tx.id, after: tx });
  return tx;
}

export async function editTransaction(ctx: LedgerCtx, id: string, input: EditInput): Promise<Transaction> {
  const before = await ctx.repo.getTransaction(id);
  if (!before || before.status !== "POSTED") throw new AppError("NOT_FOUND", "That transaction no longer exists.");
  const patch: TransactionPatch = {};
  if (input.type !== undefined) patch.type = input.type;
  if (input.context !== undefined) patch.context = input.context;
  if (input.amount !== undefined) patch.amountMinor = money(() => toMinor(input.amount as string | number));
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.method !== undefined) patch.method = input.method;
  if (input.description !== undefined) patch.description = input.description || null;
  if (Object.keys(patch).length === 0) throw new AppError("VALIDATION", "Nothing to change.");
  if (before.type === "TRANSFER") {
    const touchesLegs =
      (patch.type !== undefined) ||
      (patch.amountMinor !== undefined && patch.amountMinor !== before.amountMinor) ||
      (patch.currency !== undefined && patch.currency !== before.currency);
    if (touchesLegs) {
      throw new AppError("VALIDATION", "An exchange can't be changed into something else. Delete it and record it again.");
    }
    delete patch.amountMinor;
    delete patch.currency;
  }
  const after = await ctx.repo.updateTransaction(id, patch);
  if (!after) throw new AppError("NOT_FOUND", "That transaction no longer exists.");
  await ctx.repo.audit({ userId: ctx.userId, action: "TX_UPDATE", entity: "Transaction", entityId: id, before, after });
  return after;
}

export async function voidTransaction(ctx: LedgerCtx, id: string): Promise<void> {
  const before = await ctx.repo.getTransaction(id);
  const after = before ? await ctx.repo.voidTransaction(id) : null;
  if (!before || !after) throw new AppError("NOT_FOUND", "That transaction no longer exists.");
  await ctx.repo.audit({ userId: ctx.userId, action: "TX_VOID", entity: "Transaction", entityId: id, before, after });
}

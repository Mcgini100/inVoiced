/**
 * Ledger rules and tenancy isolation, run against every Repo implementation:
 * always the in-memory one, and the real Postgres one when TEST_DATABASE_URL is set (CI).
 */
import { afterAll, describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { MemoryRepo } from "@/server/repo/memory";
import type { Repo } from "@/server/repo/types";
import { enforceLimit } from "@/server/ratelimit";
import { requestOtp, resolveSession, verifyOtp } from "@/server/services/auth";
import { PAGE_SIZE, createEntry, createTransfer, editTransaction, getDashboard, setMyRate, voidTransaction } from "@/server/services/ledger";
import { makeAuth, makeLedger, randomPhone } from "./helpers";

type Backend = { name: string; make: () => Promise<{ repo: Repo; close: () => Promise<void> }> };

const backends: Backend[] = [{ name: "memory", make: async () => ({ repo: new MemoryRepo(), close: async () => {} }) }];

if (process.env.TEST_DATABASE_URL) {
  backends.push({
    name: "postgres",
    make: async () => {
      const { PrismaClient } = await import("@prisma/client");
      const { PrismaRepo } = await import("@/server/repo/prisma");
      const client = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
      return { repo: new PrismaRepo(client), close: () => client.$disconnect() };
    },
  });
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return "NO_ERROR";
}

const income = { type: "INCOME", context: "BUSINESS", currency: "USD", method: "CASH" } as const;

describe.each(backends)("ledger on $name", ({ make }) => {
  const ready = make();
  afterAll(async () => (await ready).close());

  it("answers a health ping", async () => {
    await (await ready).repo.ping();
  });

  it("computes balances per currency from income, expenses and exchanges", async () => {
    const ctx = await makeLedger((await ready).repo);
    await createEntry(ctx, { ...income, amount: "100" });
    await createEntry(ctx, { ...income, type: "EXPENSE", amount: 12.5, method: "ECOCASH" });
    await createEntry(ctx, { ...income, currency: "ZWG", amount: "500", context: "PERSONAL" });
    const exchange = await createTransfer(ctx, { amount: "20", fromCurrency: "USD", method: "CASH", rate: "26.5" });
    expect(exchange).toMatchObject({ type: "TRANSFER", amountMinor: 2000, currency: "USD", toCurrency: "ZWG", toAmountMinor: 53000, rate: "26.5" });
    await createTransfer(ctx, { amount: "265", fromCurrency: "ZWG", method: "CASH", rate: "26.5" });
    const { balances } = await getDashboard(ctx);
    // USD: 100 - 12.50 - 20 + 10 = 77.50 ; ZWG: 500 + 530 - 265 = 765
    expect(balances).toEqual({ USD: 7750, ZWG: 76500 });
  });

  it("an exchange keeps its original amounts when the rate changes later", async () => {
    const ctx = await makeLedger((await ready).repo);
    await setMyRate(ctx, "26.5");
    await createTransfer(ctx, { amount: "10", fromCurrency: "USD", method: "CASH", rate: "26.5" });
    await setMyRate(ctx, "40");
    expect((await getDashboard(ctx)).balances).toEqual({ USD: -1000, ZWG: 26500 });
  });

  it("snapshots the business rate on new entries and stores no rate when none is set", async () => {
    const ctx = await makeLedger((await ready).repo);
    expect((await createEntry(ctx, { ...income, amount: 1 })).rate).toBeNull();
    await setMyRate(ctx, "27.250");
    expect((await ctx.repo.getBusiness()).myRate).toBe("27.25");
    expect((await createEntry(ctx, { ...income, amount: 1 })).rate).toBe("27.25");
    await setMyRate(ctx, null);
    expect((await ctx.repo.getBusiness()).myRate).toBeNull();
  });

  it("rejects bad amounts and rates instead of storing them", async () => {
    const ctx = await makeLedger((await ready).repo);
    for (const amount of ["0", "-1", "abc", "", Number.NaN]) {
      expect(await codeOf(createEntry(ctx, { ...income, amount })), String(amount)).toBe("VALIDATION");
    }
    for (const rate of ["0", "", "x", Number.NaN]) {
      expect(await codeOf(createTransfer(ctx, { amount: "5", fromCurrency: "USD", method: "CASH", rate })), String(rate)).toBe("VALIDATION");
      expect(await codeOf(setMyRate(ctx, rate === "" ? "nope" : rate)), String(rate)).toBe("VALIDATION");
    }
    expect(await codeOf(createTransfer(ctx, { amount: "0.01", fromCurrency: "ZWG", method: "CASH", rate: "40" }))).toBe("VALIDATION");
    expect((await getDashboard(ctx)).transactions).toHaveLength(0);
  });

  it("edits entries, and never lets an exchange be reshaped", async () => {
    const ctx = await makeLedger((await ready).repo);
    const tx = await createEntry(ctx, { ...income, amount: "10" });
    const edited = await editTransaction(ctx, tx.id, { amount: "15.5", currency: "ZWG", type: "EXPENSE", description: "bread" });
    expect(edited).toMatchObject({ amountMinor: 1550, currency: "ZWG", type: "EXPENSE", description: "bread", status: "POSTED" });
    expect(await codeOf(editTransaction(ctx, tx.id, {}))).toBe("VALIDATION");

    const exchange = await createTransfer(ctx, { amount: "10", fromCurrency: "USD", method: "CASH", rate: "26.5" });
    expect(await codeOf(editTransaction(ctx, exchange.id, { amount: "99" }))).toBe("VALIDATION");
    expect(await codeOf(editTransaction(ctx, exchange.id, { currency: "ZWG" }))).toBe("VALIDATION");
    expect(await codeOf(editTransaction(ctx, exchange.id, { type: "INCOME" }))).toBe("VALIDATION");
    const renamed = await editTransaction(ctx, exchange.id, { description: "changed at Road Port", method: "ECOCASH" });
    expect(renamed).toMatchObject({ description: "changed at Road Port", method: "ECOCASH", amountMinor: 1000, toAmountMinor: 26500 });
  });

  it("voids instead of deleting, and voided entries leave balances and lists", async () => {
    const ctx = await makeLedger((await ready).repo);
    const keep = await createEntry(ctx, { ...income, amount: "7" });
    const gone = await createEntry(ctx, { ...income, amount: "100" });
    await voidTransaction(ctx, gone.id);
    const dash = await getDashboard(ctx);
    expect(dash.balances.USD).toBe(700);
    expect(dash.transactions.map((t) => t.id)).toEqual([keep.id]);
    expect((await ctx.repo.getTransaction(gone.id))?.status).toBe("VOID");
    expect((await ctx.repo.lastPosted())?.id).toBe(keep.id);
    expect(await codeOf(voidTransaction(ctx, gone.id))).toBe("NOT_FOUND");
    expect(await codeOf(editTransaction(ctx, gone.id, { amount: "1" }))).toBe("NOT_FOUND");
  });

  it("pages through history newest first without gaps or repeats", async () => {
    const ctx = await makeLedger((await ready).repo);
    const total = PAGE_SIZE + 5;
    for (let i = 1; i <= total; i++) {
      await ctx.repo.createTransaction({
        ...income, amountMinor: i, description: null, rate: null, toCurrency: null, toAmountMinor: null,
        source: "MANUAL", transcript: null, createdById: ctx.userId, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      });
    }
    const first = await getDashboard(ctx);
    expect(first.transactions).toHaveLength(PAGE_SIZE);
    expect(first.transactions[0].amountMinor).toBe(total);
    expect(first.nextCursor).not.toBeNull();
    const second = await getDashboard(ctx, first.nextCursor);
    expect(second.transactions).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const seen = [...first.transactions, ...second.transactions].map((t) => t.amountMinor);
    expect(seen).toEqual(Array.from({ length: total }, (_, i) => total - i));
  });

  it("keeps two businesses completely separate", async () => {
    const { repo } = await ready;
    const alice = await makeLedger(repo);
    const bob = await makeLedger(repo);
    expect(alice.businessId).not.toBe(bob.businessId);
    const secret = await createEntry(alice, { ...income, amount: "999", description: "alice only" });
    await setMyRate(alice, "30");

    const bobView = await getDashboard(bob);
    expect(bobView.transactions).toHaveLength(0);
    expect(bobView.balances).toEqual({ USD: 0, ZWG: 0 });
    expect(bobView.business.myRate).toBeNull();
    expect(await bob.repo.getTransaction(secret.id)).toBeNull();
    expect(await bob.repo.lastPosted()).toBeNull();
    expect(await codeOf(editTransaction(bob, secret.id, { amount: "1" }))).toBe("NOT_FOUND");
    expect(await codeOf(voidTransaction(bob, secret.id))).toBe("NOT_FOUND");
    expect(await bob.repo.updateTransaction(secret.id, { amountMinor: 1 })).toBeNull();
    expect(await bob.repo.voidTransaction(secret.id)).toBeNull();
    expect((await getDashboard(bob, secret.id)).transactions).toHaveLength(0);

    const still = await alice.repo.getTransaction(secret.id);
    expect(still).toMatchObject({ amountMinor: 99900, status: "POSTED", description: "alice only" });
    expect((await getDashboard(alice)).balances.USD).toBe(99900);
  });

  it("gives each phone number its own account through the real sign-in flow", async () => {
    const { repo } = await ready;
    const { deps, sender } = makeAuth(repo);
    const sessions = [];
    for (const phone of [randomPhone(), randomPhone()]) {
      await requestOtp(deps, { phone, ip: `ip-${phone}` });
      const { token } = await verifyOtp(deps, { phone, code: sender.last() });
      sessions.push(await resolveSession(repo, token, deps.now()));
    }
    expect(sessions[0]?.businessId).toBeTruthy();
    expect(sessions[0]?.businessId).not.toBe(sessions[1]?.businessId);
    expect(sessions[0]?.userId).not.toBe(sessions[1]?.userId);
  });

  it("counts rate-limit hits per key and window", async () => {
    const { repo } = await ready;
    const key = `test:${randomPhone()}`;
    const now = new Date("2026-11-24T10:00:30Z");
    await enforceLimit(repo, key, 2, 60, now);
    await enforceLimit(repo, key, 2, 60, now);
    expect(await codeOf(enforceLimit(repo, key, 2, 60, now))).toBe("RATE_LIMITED");
    await enforceLimit(repo, key, 2, 60, new Date(now.getTime() + 60_000));
    await enforceLimit(repo, `${key}:other`, 2, 60, now);
  });
});

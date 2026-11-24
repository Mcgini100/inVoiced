"use server";

import { cookies } from "next/headers";
import type { z } from "zod";
import type { DashboardData } from "@/lib/domain";
import { env } from "@/lib/env";
import { AppError, type PublicError, toPublicError } from "@/lib/errors";
import { errorFields, log } from "@/lib/log";
import { SESSION_COOKIE, authDeps, clientIp, getRepo, requireLedger } from "@/server/context";
import { enforceLimit } from "@/server/ratelimit";
import { CursorSchema, EditInputSchema, EntryInputSchema, IdSchema, RateInputSchema, TransferInputSchema } from "@/server/schemas";
import { endSession, requestOtp, verifyOtp } from "@/server/services/auth";
import { createEntry, createTransfer, editTransaction, getDashboard, setMyRate, voidTransaction } from "@/server/services/ledger";

export type Result<T> = { ok: true; data: T } | { ok: false; error: PublicError };

async function run<T>(name: string, fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (!(err instanceof AppError)) log("error", "action.failed", { action: name, ...errorFields(err) });
    return { ok: false, error: toPublicError(err) };
  }
}

function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError("VALIDATION", "Please check the details and try again.");
  return result.data;
}

/** Authenticated, rate-limited mutation that answers with the refreshed dashboard. */
async function mutate(name: string, fn: (ctx: Awaited<ReturnType<typeof requireLedger>>) => Promise<void>): Promise<Result<DashboardData>> {
  return run(name, async () => {
    const ctx = await requireLedger();
    await enforceLimit(getRepo(), `mutate:${ctx.userId}`, 120, 60, new Date());
    await fn(ctx);
    return getDashboard(ctx);
  });
}

export async function requestOtpAction(phone: unknown): Promise<Result<{ phone: string; devCode?: string }>> {
  return run("requestOtp", async () => {
    if (typeof phone !== "string" || phone.length > 32) throw new AppError("VALIDATION", "Enter a valid phone number.");
    return requestOtp(authDeps(), { phone, ip: await clientIp() });
  });
}

export async function verifyOtpAction(phone: unknown, code: unknown): Promise<Result<null>> {
  return run("verifyOtp", async () => {
    if (typeof phone !== "string" || typeof code !== "string" || phone.length > 32 || code.length > 16) {
      throw new AppError("VALIDATION", "That code is not valid.");
    }
    const { token, expiresAt } = await verifyOtp(authDeps(), { phone, code });
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: env().NODE_ENV === "production",
      path: "/",
      expires: expiresAt,
    });
    return null;
  });
}

export async function logoutAction(): Promise<Result<null>> {
  return run("logout", async () => {
    const store = await cookies();
    await endSession(getRepo(), store.get(SESSION_COOKIE)?.value);
    store.delete(SESSION_COOKIE);
    return null;
  });
}

export async function loadMoreAction(cursor: unknown): Promise<Result<DashboardData>> {
  return run("loadMore", async () => getDashboard(await requireLedger(), parse(CursorSchema, cursor)));
}

export async function setRateAction(rate: unknown): Promise<Result<DashboardData>> {
  return mutate("setRate", (ctx) => setMyRate(ctx, parse(RateInputSchema, rate)));
}

export async function addEntryAction(input: unknown): Promise<Result<DashboardData>> {
  return mutate("addEntry", async (ctx) => {
    await createEntry(ctx, parse(EntryInputSchema, input));
  });
}

export async function editTransactionAction(id: unknown, input: unknown): Promise<Result<DashboardData>> {
  return mutate("editTransaction", async (ctx) => {
    await editTransaction(ctx, parse(IdSchema, id), parse(EditInputSchema, input));
  });
}

export async function deleteTransactionAction(id: unknown): Promise<Result<DashboardData>> {
  return mutate("deleteTransaction", (ctx) => voidTransaction(ctx, parse(IdSchema, id)));
}

export async function transferAction(input: unknown): Promise<Result<DashboardData>> {
  return mutate("transfer", async (ctx) => {
    await createTransfer(ctx, parse(TransferInputSchema, input));
  });
}

import { cookies, headers } from "next/headers";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getPrisma } from "./db";
import { PrismaRepo } from "./repo/prisma";
import type { Repo } from "./repo/types";
import { type AuthDeps, type OtpSender, resolveSession } from "./services/auth";
import type { LedgerCtx } from "./services/ledger";

export const SESSION_COOKIE = "inv_session";

let repo: Repo | null = null;
export function getRepo(): Repo {
  repo ??= new PrismaRepo(getPrisma());
  return repo;
}

/** Development / pilot delivery: the code is written to the server log instead of being sent. */
const consoleSender: OtpSender = {
  async send(phone, code) {
    console.log(`[otp] sign-in code for ${phone}: ${code}`);
  },
};

export function authDeps(): AuthDeps {
  const e = env();
  const useConsole = e.OTP_PROVIDER === "console" || (!e.OTP_PROVIDER && e.NODE_ENV !== "production");
  return {
    repo: getRepo(),
    secret: e.AUTH_SECRET,
    now: () => new Date(),
    sender: useConsole ? consoleSender : null,
    exposeCode: useConsole && e.NODE_ENV !== "production",
  };
}

export interface SessionInfo {
  userId: string;
  businessId: string;
}

export async function getSession(): Promise<SessionInfo | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await resolveSession(getRepo(), token, new Date());
  return session ? { userId: session.userId, businessId: session.businessId } : null;
}

/** The only entry point to ledger data: an authenticated user bound to their own business. */
export async function requireLedger(): Promise<LedgerCtx & { businessId: string }> {
  const session = await getSession();
  if (!session) throw new AppError("UNAUTHORIZED", "Please sign in again.");
  return { repo: getRepo().forBusiness(session.businessId), userId: session.userId, businessId: session.businessId };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

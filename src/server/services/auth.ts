import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors";
import { normalisePhone } from "@/lib/phone";
import { enforceLimit } from "../ratelimit";
import type { Repo, SessionRecord } from "../repo/types";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

export interface AuthDeps {
  repo: Repo;
  secret: string;
  now: () => Date;
  /** null means no delivery channel is configured, so sign-in is refused. */
  sender: OtpSender | null;
  /** Development only: hand the code back to the caller so it can be shown on screen. */
  exposeCode: boolean;
}

const INVALID = "That code is not valid. Request a new one and try again.";

function hashCode(secret: string, phone: string, code: string): string {
  return createHmac("sha256", secret).update(`${phone}:${code}`).digest("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function requestOtp(deps: AuthDeps, input: { phone: string; ip: string }): Promise<{ phone: string; devCode?: string }> {
  const phone = normalisePhone(input.phone);
  if (!deps.sender) throw new AppError("NOT_CONFIGURED", "Sign-in codes are not set up on this server yet.");
  const now = deps.now();
  await enforceLimit(deps.repo, `otp:phone:${phone}`, 3, 600, now, "Too many codes requested. Try again in 10 minutes.");
  await enforceLimit(deps.repo, `otp:ip:${input.ip}`, 20, 3600, now);
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await deps.repo.createOtp({ phone, codeHash: hashCode(deps.secret, phone, code), expiresAt: new Date(now.getTime() + OTP_TTL_MS) }, now);
  await deps.sender.send(phone, code);
  return deps.exposeCode ? { phone, devCode: code } : { phone };
}

export async function verifyOtp(deps: AuthDeps, input: { phone: string; code: string }): Promise<{ token: string; expiresAt: Date }> {
  const phone = normalisePhone(input.phone);
  const code = input.code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) throw new AppError("VALIDATION", INVALID);
  const now = deps.now();
  await enforceLimit(deps.repo, `otp:verify:${phone}`, 10, 600, now);
  const challenge = await deps.repo.latestActiveOtp(phone, now);
  if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) throw new AppError("VALIDATION", INVALID);
  if (!safeEqual(challenge.codeHash, hashCode(deps.secret, phone, code))) {
    await deps.repo.bumpOtpAttempts(challenge.id);
    throw new AppError("VALIDATION", INVALID);
  }
  if (!(await deps.repo.consumeOtp(challenge.id, now))) throw new AppError("VALIDATION", INVALID);
  const { userId, businessId } = await deps.repo.findOrCreateUser(phone, "My business");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await deps.repo.createSession({ tokenHash: hashToken(token), userId, businessId, expiresAt });
  return { token, expiresAt };
}

export async function resolveSession(repo: Repo, token: string | undefined, now: Date): Promise<SessionRecord | null> {
  if (!token) return null;
  return repo.findSession(hashToken(token), now);
}

export async function endSession(repo: Repo, token: string | undefined): Promise<void> {
  if (token) await repo.deleteSession(hashToken(token));
}

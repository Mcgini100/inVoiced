import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { normalisePhone } from "@/lib/phone";
import { OTP_TTL_MS, SESSION_TTL_MS, endSession, requestOtp, resolveSession, verifyOtp } from "@/server/services/auth";
import { makeAuth } from "./helpers";

const PHONE = "0771234567";
const E164 = "+263771234567";

async function code(err: Promise<unknown>): Promise<string> {
  try {
    await err;
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return "NO_ERROR";
}

describe("phone numbers", () => {
  it("normalises local and international forms", () => {
    for (const p of ["0771234567", "771234567", "263771234567", "+263 77 123 4567", "00263771234567"]) {
      expect(normalisePhone(p), p).toBe(E164);
    }
    expect(normalisePhone("+27821234567")).toBe("+27821234567");
  });
  it("rejects junk", () => {
    for (const p of ["", "abc", "12345", "+0771234567", "07712345678901234"]) expect(() => normalisePhone(p), p).toThrow(AppError);
  });
});

describe("sign-in", () => {
  it("signs a new user in and gives them their own business", async () => {
    const { deps, sender, repo } = makeAuth();
    const res = await requestOtp(deps, { phone: PHONE, ip: "1.1.1.1" });
    expect(res).toEqual({ phone: E164 });
    expect(sender.last()).toMatch(/^\d{6}$/);
    const { token } = await verifyOtp(deps, { phone: PHONE, code: sender.last() });
    const session = await resolveSession(repo, token, deps.now());
    expect(session).not.toBeNull();
    const again = await repo.findOrCreateUser(E164, "x");
    expect(session).toMatchObject(again);
  });

  it("only reveals the code when explicitly in development mode", async () => {
    const { deps, sender } = makeAuth();
    const res = await requestOtp({ ...deps, exposeCode: true }, { phone: PHONE, ip: "1.1.1.1" });
    expect(res.devCode).toBe(sender.last());
  });

  it("refuses to send codes when no delivery channel is configured", async () => {
    const { deps } = makeAuth();
    expect(await code(requestOtp({ ...deps, sender: null }, { phone: PHONE, ip: "1.1.1.1" }))).toBe("NOT_CONFIGURED");
  });

  it("rejects wrong, reused and expired codes", async () => {
    const { deps, sender, clock } = makeAuth();
    await requestOtp(deps, { phone: PHONE, ip: "1.1.1.1" });
    const good = sender.last();
    const wrong = good === "000000" ? "000001" : "000000";
    expect(await code(verifyOtp(deps, { phone: PHONE, code: wrong }))).toBe("VALIDATION");
    expect(await code(verifyOtp(deps, { phone: PHONE, code: "12" }))).toBe("VALIDATION");
    await verifyOtp(deps, { phone: PHONE, code: good });
    expect(await code(verifyOtp(deps, { phone: PHONE, code: good }))).toBe("VALIDATION");

    await requestOtp(deps, { phone: PHONE, ip: "1.1.1.1" });
    clock.now = new Date(clock.now.getTime() + OTP_TTL_MS + 1);
    expect(await code(verifyOtp(deps, { phone: PHONE, code: sender.last() }))).toBe("VALIDATION");
  });

  it("locks a code after five wrong guesses", async () => {
    const { deps, sender } = makeAuth();
    await requestOtp(deps, { phone: PHONE, ip: "1.1.1.1" });
    const good = sender.last();
    const wrong = good === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) expect(await code(verifyOtp(deps, { phone: PHONE, code: wrong }))).toBe("VALIDATION");
    expect(await code(verifyOtp(deps, { phone: PHONE, code: good }))).toBe("VALIDATION");
  });

  it("a newer code invalidates the older one", async () => {
    const { deps, sender } = makeAuth();
    await requestOtp(deps, { phone: PHONE, ip: "1.1.1.1" });
    const first = sender.last();
    await requestOtp(deps, { phone: PHONE, ip: "1.1.1.1" });
    const second = sender.last();
    if (first !== second) expect(await code(verifyOtp(deps, { phone: PHONE, code: first }))).toBe("VALIDATION");
    await verifyOtp(deps, { phone: PHONE, code: second });
  });

  it("limits how many codes one phone can request", async () => {
    const { deps } = makeAuth();
    for (let i = 0; i < 3; i++) await requestOtp(deps, { phone: PHONE, ip: "1.1.1.1" });
    expect(await code(requestOtp(deps, { phone: PHONE, ip: "1.1.1.1" }))).toBe("RATE_LIMITED");
  });

  it("a code for one phone does not work for another", async () => {
    const { deps, sender } = makeAuth();
    await requestOtp(deps, { phone: PHONE, ip: "1.1.1.1" });
    await requestOtp(deps, { phone: "0779999999", ip: "1.1.1.1" });
    const forOther = sender.sent[1].code;
    const forMine = sender.sent[0].code;
    if (forOther !== forMine) expect(await code(verifyOtp(deps, { phone: PHONE, code: forOther }))).toBe("VALIDATION");
  });

  it("sessions expire, can be ended, and unknown tokens are rejected", async () => {
    const { deps, sender, repo, clock } = makeAuth();
    await requestOtp(deps, { phone: PHONE, ip: "1.1.1.1" });
    const { token } = await verifyOtp(deps, { phone: PHONE, code: sender.last() });
    expect(await resolveSession(repo, "not-a-token", clock.now)).toBeNull();
    expect(await resolveSession(repo, undefined, clock.now)).toBeNull();
    expect(await resolveSession(repo, token, new Date(clock.now.getTime() + SESSION_TTL_MS + 1))).toBeNull();
    await endSession(repo, token);
    expect(await resolveSession(repo, token, clock.now)).toBeNull();
  });
});

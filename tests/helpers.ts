import { MemoryRepo } from "@/server/repo/memory";
import type { Repo } from "@/server/repo/types";
import type { AuthDeps, OtpSender } from "@/server/services/auth";
import type { LedgerCtx } from "@/server/services/ledger";

export class FakeSender implements OtpSender {
  sent: { phone: string; code: string }[] = [];
  async send(phone: string, code: string) {
    this.sent.push({ phone, code });
  }
  last(): string {
    return this.sent[this.sent.length - 1].code;
  }
}

export function makeAuth(repo: Repo = new MemoryRepo()) {
  const sender = new FakeSender();
  const clock = { now: new Date("2026-11-24T10:00:00Z") };
  const deps: AuthDeps = { repo, secret: "test-secret-test-secret-test-secret!", now: () => clock.now, sender, exposeCode: false };
  return { repo, sender, clock, deps };
}

/** A unique, valid Zimbabwean mobile number, so tests can share a real database. */
export function randomPhone(): string {
  return `+2637${Math.floor(10000000 + Math.random() * 89999999)}`;
}

export async function makeLedger(repo: Repo, phone = randomPhone()): Promise<LedgerCtx & { businessId: string }> {
  const { userId, businessId } = await repo.findOrCreateUser(phone, "Test business");
  return { repo: repo.forBusiness(businessId), userId, businessId };
}

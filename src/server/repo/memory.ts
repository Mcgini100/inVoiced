/** In-memory Repo used by unit tests. Mirrors the Prisma implementation's behaviour. */
import { randomUUID } from "node:crypto";
import type { Balances, Business, Transaction } from "@/lib/domain";
import type { AuditEntry, BusinessRepo, NewTransaction, OtpRecord, Page, Repo, SessionRecord, TransactionPatch } from "./types";

interface OtpRow extends OtpRecord {
  consumedAt: Date | null;
  createdAt: Date;
}
interface TxRow extends Transaction {
  seq: number;
}

export class MemoryRepo implements Repo {
  private otps: OtpRow[] = [];
  private users = new Map<string, { userId: string; businessId: string }>();
  private businesses = new Map<string, Business>();
  private sessions = new Map<string, SessionRecord>();
  private buckets = new Map<string, number>();
  private txs: TxRow[] = [];
  private seq = 0;
  readonly auditLog: (AuditEntry & { businessId: string })[] = [];

  async ping(): Promise<void> {}

  async createOtp(data: { phone: string; codeHash: string; expiresAt: Date }, now: Date): Promise<void> {
    for (const o of this.otps) if (o.phone === data.phone && !o.consumedAt) o.consumedAt = now;
    this.otps.push({ id: randomUUID(), attempts: 0, consumedAt: null, createdAt: now, ...data });
  }

  async latestActiveOtp(phone: string, now: Date): Promise<OtpRecord | null> {
    const found = [...this.otps].reverse().find((o) => o.phone === phone && !o.consumedAt && o.expiresAt > now);
    return found ? { ...found } : null;
  }

  async bumpOtpAttempts(id: string): Promise<void> {
    const o = this.otps.find((x) => x.id === id);
    if (o) o.attempts += 1;
  }

  async consumeOtp(id: string, now: Date): Promise<boolean> {
    const o = this.otps.find((x) => x.id === id);
    if (!o || o.consumedAt) return false;
    o.consumedAt = now;
    return true;
  }

  async findOrCreateUser(phone: string, defaultBusinessName: string): Promise<{ userId: string; businessId: string }> {
    const existing = this.users.get(phone);
    if (existing) return existing;
    const created = { userId: randomUUID(), businessId: randomUUID() };
    this.users.set(phone, created);
    this.businesses.set(created.businessId, { id: created.businessId, name: defaultBusinessName, myRate: null });
    return created;
  }

  async createSession(data: { tokenHash: string; userId: string; businessId: string; expiresAt: Date }): Promise<void> {
    this.sessions.set(data.tokenHash, { userId: data.userId, businessId: data.businessId, expiresAt: data.expiresAt });
  }

  async findSession(tokenHash: string, now: Date): Promise<SessionRecord | null> {
    const s = this.sessions.get(tokenHash);
    return s && s.expiresAt > now ? { ...s } : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
  }

  async hit(key: string, windowStart: Date): Promise<number> {
    const k = `${key}|${windowStart.toISOString()}`;
    const next = (this.buckets.get(k) ?? 0) + 1;
    this.buckets.set(k, next);
    return next;
  }

  forBusiness(businessId: string): BusinessRepo {
    const strip = (row: TxRow): Transaction => {
      const { seq: _seq, ...tx } = row;
      void _seq;
      return { ...tx };
    };
    const mine = () => this.txs.filter((t) => t.businessId === businessId).sort((a, b) => b.seq - a.seq);
    const findPosted = (id: string) => this.txs.find((t) => t.id === id && t.businessId === businessId && t.status === "POSTED");

    return {
      businessId,
      getBusiness: async () => {
        const b = this.businesses.get(businessId);
        if (!b) throw new Error("Business not found");
        return { ...b };
      },
      setMyRate: async (rate) => {
        const b = this.businesses.get(businessId);
        if (b) b.myRate = rate;
      },
      listTransactions: async ({ limit, cursor }): Promise<Page> => {
        const posted = mine().filter((t) => t.status === "POSTED");
        let start = 0;
        if (cursor) {
          const idx = posted.findIndex((t) => t.id === cursor);
          if (idx === -1) return { items: [], nextCursor: null };
          start = idx + 1;
        }
        const slice = posted.slice(start, start + limit + 1);
        const items = slice.slice(0, limit).map(strip);
        return { items, nextCursor: slice.length > limit ? items[items.length - 1].id : null };
      },
      getTransaction: async (id) => {
        const row = this.txs.find((t) => t.id === id && t.businessId === businessId);
        return row ? strip(row) : null;
      },
      lastPosted: async () => {
        const row = mine().find((t) => t.status === "POSTED");
        return row ? strip(row) : null;
      },
      createTransaction: async (data: NewTransaction) => {
        const { createdAt, ...rest } = data;
        const at = (createdAt ?? new Date()).toISOString();
        const row: TxRow = { id: randomUUID(), businessId, status: "POSTED", createdAt: at, updatedAt: at, seq: ++this.seq, ...rest };
        this.txs.push(row);
        return strip(row);
      },
      updateTransaction: async (id, patch: TransactionPatch) => {
        const row = findPosted(id);
        if (!row) return null;
        Object.assign(row, patch, { updatedAt: new Date().toISOString() });
        return strip(row);
      },
      voidTransaction: async (id) => {
        const row = findPosted(id);
        if (!row) return null;
        row.status = "VOID";
        row.updatedAt = new Date().toISOString();
        return strip(row);
      },
      balances: async (): Promise<Balances> => {
        const out: Balances = { USD: 0, ZWG: 0 };
        for (const t of mine()) {
          if (t.status !== "POSTED") continue;
          if (t.type === "INCOME") out[t.currency] += t.amountMinor;
          else if (t.type === "EXPENSE") out[t.currency] -= t.amountMinor;
          else {
            out[t.currency] -= t.amountMinor;
            if (t.toCurrency && t.toAmountMinor != null) out[t.toCurrency] += t.toAmountMinor;
          }
        }
        return out;
      },
      audit: async (entry) => {
        this.auditLog.push({ ...entry, businessId });
      },
    };
  }
}

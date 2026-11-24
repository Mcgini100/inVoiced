/** Postgres-backed Repo. Keep this file thin: no business rules, only scoped queries and row mapping. */
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Balances, Business, Currency, Method, Transaction, TxContext, TxSource, TxStatus, TxType } from "@/lib/domain";
import type { AuditEntry, BusinessRepo, NewTransaction, OtpRecord, Page, Repo, SessionRecord, TransactionPatch } from "./types";

interface TxRow {
  id: string;
  businessId: string;
  type: string;
  context: string;
  amountMinor: bigint;
  currency: string;
  method: string;
  description: string | null;
  rate: { toString(): string } | null;
  toCurrency: string | null;
  toAmountMinor: bigint | null;
  status: string;
  source: string;
  transcript: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Decimal(18,6) prints as "26.500000"; trim to the canonical form used everywhere else. */
function decimalToString(d: { toString(): string } | null): string | null {
  if (d == null) return null;
  const s = d.toString();
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

function toTransaction(row: TxRow): Transaction {
  return {
    id: row.id,
    businessId: row.businessId,
    type: row.type as TxType,
    context: row.context as TxContext,
    amountMinor: Number(row.amountMinor),
    currency: row.currency as Currency,
    method: row.method as Method,
    description: row.description,
    rate: decimalToString(row.rate),
    toCurrency: row.toCurrency as Currency | null,
    toAmountMinor: row.toAmountMinor == null ? null : Number(row.toAmountMinor),
    status: row.status as TxStatus,
    source: row.source as TxSource,
    transcript: row.transcript,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class PrismaRepo implements Repo {
  constructor(private readonly db: PrismaClient) {}

  async ping(): Promise<void> {
    await this.db.$queryRaw`SELECT 1`;
  }

  async createOtp(data: { phone: string; codeHash: string; expiresAt: Date }, now: Date): Promise<void> {
    await this.db.$transaction([
      this.db.otpChallenge.updateMany({ where: { phone: data.phone, consumedAt: null }, data: { consumedAt: now } }),
      this.db.otpChallenge.create({ data: { phone: data.phone, codeHash: data.codeHash, expiresAt: data.expiresAt, createdAt: now } }),
    ]);
  }

  async latestActiveOtp(phone: string, now: Date): Promise<OtpRecord | null> {
    const row = await this.db.otpChallenge.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    return { id: row.id, phone: row.phone, codeHash: row.codeHash, expiresAt: row.expiresAt, attempts: row.attempts };
  }

  async bumpOtpAttempts(id: string): Promise<void> {
    await this.db.otpChallenge.updateMany({ where: { id }, data: { attempts: { increment: 1 } } });
  }

  async consumeOtp(id: string, now: Date): Promise<boolean> {
    const res = await this.db.otpChallenge.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: now } });
    return res.count === 1;
  }

  async findOrCreateUser(phone: string, defaultBusinessName: string): Promise<{ userId: string; businessId: string }> {
    const user = await this.db.user.upsert({
      where: { phone },
      update: {},
      create: {
        phone,
        memberships: { create: { role: "OWNER", business: { create: { name: defaultBusinessName } } } },
      },
      include: { memberships: { orderBy: { createdAt: "asc" }, take: 1 } },
    });
    const first = user.memberships[0];
    if (first) return { userId: user.id, businessId: first.businessId };
    const business = await this.db.business.create({
      data: { name: defaultBusinessName, memberships: { create: { role: "OWNER", userId: user.id } } },
    });
    return { userId: user.id, businessId: business.id };
  }

  async createSession(data: { tokenHash: string; userId: string; businessId: string; expiresAt: Date }): Promise<void> {
    await this.db.session.create({ data });
  }

  async findSession(tokenHash: string, now: Date): Promise<SessionRecord | null> {
    const row = await this.db.session.findUnique({ where: { tokenHash } });
    if (!row || row.expiresAt <= now) return null;
    return { userId: row.userId, businessId: row.businessId, expiresAt: row.expiresAt };
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.session.deleteMany({ where: { tokenHash } });
  }

  async hit(key: string, windowStart: Date): Promise<number> {
    const row = await this.db.rateLimitBucket.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });
    return row.count;
  }

  forBusiness(businessId: string): BusinessRepo {
    const db = this.db;
    const order = [{ createdAt: "desc" as const }, { id: "desc" as const }];

    return {
      businessId,

      async getBusiness(): Promise<Business> {
        const b = await db.business.findUnique({ where: { id: businessId } });
        if (!b) throw new Error("Business not found");
        return { id: b.id, name: b.name, myRate: decimalToString(b.myRate) };
      },

      async setMyRate(rate: string | null): Promise<void> {
        await db.business.update({ where: { id: businessId }, data: { myRate: rate } });
      },

      async listTransactions({ limit, cursor }: { limit: number; cursor?: string | null }): Promise<Page> {
        if (cursor) {
          // A cursor from another business (or a voided row) simply ends the list.
          const anchor = await db.transaction.findFirst({ where: { id: cursor, businessId, status: "POSTED" }, select: { id: true } });
          if (!anchor) return { items: [], nextCursor: null };
        }
        const rows: TxRow[] = await db.transaction.findMany({
          where: { businessId, status: "POSTED" },
          orderBy: order,
          take: limit + 1,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        const items = rows.slice(0, limit).map(toTransaction);
        return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
      },

      async getTransaction(id: string): Promise<Transaction | null> {
        const row: TxRow | null = await db.transaction.findFirst({ where: { id, businessId } });
        return row ? toTransaction(row) : null;
      },

      async lastPosted(): Promise<Transaction | null> {
        const row: TxRow | null = await db.transaction.findFirst({ where: { businessId, status: "POSTED" }, orderBy: order });
        return row ? toTransaction(row) : null;
      },

      async createTransaction(data: NewTransaction): Promise<Transaction> {
        const row: TxRow = await db.transaction.create({
          data: {
            businessId,
            type: data.type,
            context: data.context,
            amountMinor: BigInt(data.amountMinor),
            currency: data.currency,
            method: data.method,
            description: data.description,
            rate: data.rate,
            toCurrency: data.toCurrency,
            toAmountMinor: data.toAmountMinor == null ? null : BigInt(data.toAmountMinor),
            source: data.source,
            transcript: data.transcript,
            createdById: data.createdById,
            ...(data.createdAt ? { createdAt: data.createdAt } : {}),
          },
        });
        return toTransaction(row);
      },

      async updateTransaction(id: string, patch: TransactionPatch): Promise<Transaction | null> {
        const { amountMinor, ...rest } = patch;
        const res = await db.transaction.updateMany({
          where: { id, businessId, status: "POSTED" },
          data: { ...rest, ...(amountMinor === undefined ? {} : { amountMinor: BigInt(amountMinor) }) },
        });
        if (res.count === 0) return null;
        return this.getTransaction(id);
      },

      async voidTransaction(id: string): Promise<Transaction | null> {
        const res = await db.transaction.updateMany({ where: { id, businessId, status: "POSTED" }, data: { status: "VOID" } });
        if (res.count === 0) return null;
        return this.getTransaction(id);
      },

      async balances(): Promise<Balances> {
        const [byTypeCurrency, transferIn] = await Promise.all([
          db.transaction.groupBy({
            by: ["type", "currency"],
            where: { businessId, status: "POSTED" },
            _sum: { amountMinor: true },
          }),
          db.transaction.groupBy({
            by: ["toCurrency"],
            where: { businessId, status: "POSTED", type: "TRANSFER" },
            _sum: { toAmountMinor: true },
          }),
        ]);
        const out: Balances = { USD: 0, ZWG: 0 };
        for (const g of byTypeCurrency) {
          const currency = g.currency as Currency;
          if (!(currency in out)) continue;
          const sum = Number(g._sum.amountMinor ?? 0);
          out[currency] += g.type === "INCOME" ? sum : -sum;
        }
        for (const g of transferIn) {
          const currency = g.toCurrency as Currency | null;
          if (!currency || !(currency in out)) continue;
          out[currency] += Number(g._sum.toAmountMinor ?? 0);
        }
        return out;
      },

      async audit(entry: AuditEntry): Promise<void> {
        await db.auditLog.create({
          data: {
            businessId,
            userId: entry.userId,
            action: entry.action,
            entity: entry.entity,
            entityId: entry.entityId,
            before: entry.before === undefined ? undefined : (JSON.parse(JSON.stringify(entry.before)) as Prisma.InputJsonValue),
            after: entry.after === undefined ? undefined : (JSON.parse(JSON.stringify(entry.after)) as Prisma.InputJsonValue),
          },
        });
      },
    };
  }
}

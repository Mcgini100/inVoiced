import type { Balances, Business, Currency, Method, Transaction, TxContext, TxSource, TxType } from "@/lib/domain";

export interface OtpRecord {
  id: string;
  phone: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
}

export interface SessionRecord {
  userId: string;
  businessId: string;
  expiresAt: Date;
}

export interface NewTransaction {
  type: TxType;
  context: TxContext;
  amountMinor: number;
  currency: Currency;
  method: Method;
  description: string | null;
  rate: string | null;
  toCurrency: Currency | null;
  toAmountMinor: number | null;
  source: TxSource;
  transcript: string | null;
  createdById: string | null;
  /** Only the legacy import sets this; everything else uses "now". */
  createdAt?: Date;
}

export interface TransactionPatch {
  type?: "INCOME" | "EXPENSE";
  context?: TxContext;
  amountMinor?: number;
  currency?: Currency;
  method?: Method;
  description?: string | null;
}

export interface AuditEntry {
  userId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

export interface Page {
  items: Transaction[];
  nextCursor: string | null;
}

/**
 * Every query made through a BusinessRepo is scoped to one business.
 * This is the only way application code reaches ledger data.
 */
export interface BusinessRepo {
  readonly businessId: string;
  getBusiness(): Promise<Business>;
  setMyRate(rate: string | null): Promise<void>;
  listTransactions(opts: { limit: number; cursor?: string | null }): Promise<Page>;
  getTransaction(id: string): Promise<Transaction | null>;
  lastPosted(): Promise<Transaction | null>;
  createTransaction(data: NewTransaction): Promise<Transaction>;
  /** Updates a POSTED row of this business; returns null if there is no such row. */
  updateTransaction(id: string, patch: TransactionPatch): Promise<Transaction | null>;
  /** Marks a POSTED row of this business VOID; returns null if there is no such row. */
  voidTransaction(id: string): Promise<Transaction | null>;
  balances(): Promise<Balances>;
  audit(entry: AuditEntry): Promise<void>;
}

export interface Repo {
  ping(): Promise<void>;
  /** Stores a new challenge and invalidates any earlier unconsumed ones for the phone. */
  createOtp(data: { phone: string; codeHash: string; expiresAt: Date }, now: Date): Promise<void>;
  latestActiveOtp(phone: string, now: Date): Promise<OtpRecord | null>;
  bumpOtpAttempts(id: string): Promise<void>;
  /** Atomically consumes a challenge; false if it was already consumed. */
  consumeOtp(id: string, now: Date): Promise<boolean>;
  /** Returns the user and their first business, creating both on first login. */
  findOrCreateUser(phone: string, defaultBusinessName: string): Promise<{ userId: string; businessId: string }>;
  createSession(data: { tokenHash: string; userId: string; businessId: string; expiresAt: Date }): Promise<void>;
  findSession(tokenHash: string, now: Date): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
  /** Increments and returns the counter for (key, windowStart). */
  hit(key: string, windowStart: Date): Promise<number>;
  forBusiness(businessId: string): BusinessRepo;
}

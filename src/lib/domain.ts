import { z } from "zod";

export const CURRENCIES = ["USD", "ZWG"] as const;
export const TX_TYPES = ["INCOME", "EXPENSE", "TRANSFER"] as const;
export const CONTEXTS = ["BUSINESS", "PERSONAL"] as const;
export const METHODS = ["CASH", "ECOCASH", "ONEMONEY", "INNBUCKS", "OMARI", "BANK"] as const;
export const SOURCES = ["VOICE", "MANUAL", "IMPORT"] as const;

export const CurrencySchema = z.enum(CURRENCIES);
export const TxTypeSchema = z.enum(TX_TYPES);
export const ContextSchema = z.enum(CONTEXTS);
export const MethodSchema = z.enum(METHODS);

export type Currency = (typeof CURRENCIES)[number];
export type TxType = (typeof TX_TYPES)[number];
export type TxContext = (typeof CONTEXTS)[number];
export type Method = (typeof METHODS)[number];
export type TxSource = (typeof SOURCES)[number];
export type TxStatus = "POSTED" | "VOID";

export const METHOD_LABELS: Record<Method, string> = {
  CASH: "Cash",
  ECOCASH: "EcoCash",
  ONEMONEY: "OneMoney",
  INNBUCKS: "InnBucks",
  OMARI: "Omari",
  BANK: "Bank / Swipe",
};

/** A ledger entry as the application sees it. Money is integer minor units; rate is a decimal string. */
export interface Transaction {
  id: string;
  businessId: string;
  type: TxType;
  context: TxContext;
  amountMinor: number;
  currency: Currency;
  method: Method;
  description: string | null;
  /** ZWG per 1 USD in force when the entry was made, e.g. "26.5". */
  rate: string | null;
  toCurrency: Currency | null;
  toAmountMinor: number | null;
  status: TxStatus;
  source: TxSource;
  transcript: string | null;
  createdById: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface Balances {
  USD: number;
  ZWG: number;
}

export interface Business {
  id: string;
  name: string;
  myRate: string | null;
}

export interface DashboardData {
  business: Business;
  balances: Balances;
  transactions: Transaction[];
  nextCursor: string | null;
}

export function otherCurrency(c: Currency): Currency {
  return c === "USD" ? "ZWG" : "USD";
}

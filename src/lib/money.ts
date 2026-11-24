/**
 * All money arithmetic lives here. Amounts are integer minor units (cents);
 * rates are "ZWG per 1 USD" held as integer micros (rate x 1,000,000).
 * No floating-point arithmetic is used for any stored value.
 */
import type { Currency } from "./domain";

export const MINOR_SCALE = 2;
export const RATE_SCALE = 6;
/** Largest single amount accepted: 1,000,000,000.00 */
export const MAX_AMOUNT_MINOR = 100_000_000_000;
/** Largest rate accepted: 1,000,000,000 ZWG per USD */
const MAX_RATE_MICROS = BigInt(10) ** BigInt(15);

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

const DECIMAL_RE = /^\d+(\.\d+)?$/;

function normalise(input: string | number): string {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) throw new MoneyError("Not a number");
    const s = String(input);
    // String(1e21) and String(1e-7) use exponent notation; neither is a sane amount.
    if (!DECIMAL_RE.test(s)) throw new MoneyError("Number out of range");
    return s;
  }
  const s = input.trim().replace(/,/g, "");
  if (!DECIMAL_RE.test(s)) throw new MoneyError("Not a valid amount");
  return s;
}

/** Parse a non-negative decimal into an integer scaled by 10^scale, rounding half to even. */
export function parseDecimal(input: string | number, scale: number): bigint {
  const s = normalise(input);
  const [whole, frac = ""] = s.split(".");
  const kept = frac.slice(0, scale).padEnd(scale, "0");
  const rest = frac.slice(scale);
  let value = BigInt(whole + kept);
  if (rest.length > 0) {
    const first = Number(rest[0]);
    const tailNonZero = /[1-9]/.test(rest.slice(1));
    const roundUp = first > 5 || (first === 5 && (tailNonZero || value % BigInt(2) === BigInt(1)));
    if (roundUp) value += BigInt(1);
  }
  return value;
}

/** Convert a user- or model-supplied amount ("12.50", 12.5) to positive integer minor units. */
export function toMinor(input: string | number): number {
  const v = parseDecimal(input, MINOR_SCALE);
  if (v <= BigInt(0)) throw new MoneyError("Amount must be greater than zero");
  if (v > BigInt(MAX_AMOUNT_MINOR)) throw new MoneyError("Amount is too large");
  return Number(v);
}

/** Parse a ZWG-per-USD rate into integer micros. */
export function parseRate(input: string | number): bigint {
  const v = parseDecimal(input, RATE_SCALE);
  if (v <= BigInt(0)) throw new MoneyError("Rate must be greater than zero");
  if (v > MAX_RATE_MICROS) throw new MoneyError("Rate is too large");
  return v;
}

/** Canonical decimal string for a rate in micros, without trailing zeros: 26500000n -> "26.5". */
export function rateToString(micros: bigint): string {
  const base = BigInt(10) ** BigInt(RATE_SCALE);
  const whole = micros / base;
  const frac = (micros % base).toString().padStart(RATE_SCALE, "0").replace(/0+$/, "");
  return frac.length > 0 ? `${whole}.${frac}` : whole.toString();
}

/** Canonicalise any accepted rate input to its stored string form. */
export function normaliseRate(input: string | number): string {
  return rateToString(parseRate(input));
}

/** Integer division of non-negative values, rounding half to even. */
export function divRoundHalfEven(n: bigint, d: bigint): bigint {
  if (d <= BigInt(0) || n < BigInt(0)) throw new MoneyError("Invalid division");
  const q = n / d;
  const r = n % d;
  const twice = r * BigInt(2);
  if (twice > d || (twice === d && q % BigInt(2) === BigInt(1))) return q + BigInt(1);
  return q;
}

/**
 * Convert between USD and ZWG at `rate` (ZWG per 1 USD). Returns minor units of `to`.
 * Same-currency conversion returns the amount unchanged.
 */
export function convertMinor(amountMinor: number, from: Currency, to: Currency, rate: string | number): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new MoneyError("Invalid amount");
  if (from === to) return amountMinor;
  const micros = parseRate(rate);
  const base = BigInt(10) ** BigInt(RATE_SCALE);
  const amount = BigInt(amountMinor);
  const out = from === "USD" ? divRoundHalfEven(amount * micros, base) : divRoundHalfEven(amount * base, micros);
  if (out > BigInt(Number.MAX_SAFE_INTEGER)) throw new MoneyError("Amount is too large");
  return Number(out);
}

const SYMBOL: Record<Currency, string> = { USD: "$", ZWG: "ZiG " };

/** "1234567" minor USD -> "$12,345.67"; negative values get a leading minus. */
export function formatMinor(minor: number, currency: Currency, opts: { symbol?: boolean } = {}): string {
  const negative = minor < 0;
  const abs = BigInt(Math.abs(Math.trunc(minor)));
  const whole = (abs / BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (abs % BigInt(100)).toString().padStart(2, "0");
  const symbol = opts.symbol === false ? "" : SYMBOL[currency];
  return `${negative ? "-" : ""}${symbol}${whole}.${cents}`;
}

/** Plain "12.50" form for putting an amount back into an input field. */
export function minorToInput(minor: number): string {
  return formatMinor(minor, "USD", { symbol: false }).replace(/,/g, "");
}

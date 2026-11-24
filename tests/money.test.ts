import { describe, expect, it } from "vitest";
import { MoneyError, convertMinor, divRoundHalfEven, formatMinor, minorToInput, normaliseRate, parseDecimal, toMinor } from "@/lib/money";

describe("toMinor", () => {
  it("parses strings and numbers exactly", () => {
    expect(toMinor("12.50")).toBe(1250);
    expect(toMinor(20)).toBe(2000);
    expect(toMinor("0.1")).toBe(10);
    expect(toMinor(0.07)).toBe(7);
    expect(toMinor("1,234.56")).toBe(123456);
    expect(toMinor(1.15)).toBe(115); // 1.15 * 100 is 114.99999999999999 in floating point
    expect(toMinor(8.2)).toBe(820);
  });

  it("rounds half to even beyond two decimals", () => {
    expect(toMinor("1.005")).toBe(100);
    expect(toMinor("1.015")).toBe(102);
    expect(toMinor("1.0051")).toBe(101);
    expect(toMinor("2.675")).toBe(268);
  });

  it("rejects zero, negatives, junk and absurd values", () => {
    for (const bad of ["0", "0.00", "0.001", "-5", "abc", "", "1e5", "12.", ".5", "NaN"]) {
      expect(() => toMinor(bad), bad).toThrow(MoneyError);
    }
    expect(() => toMinor(Number.NaN)).toThrow(MoneyError);
    expect(() => toMinor(Number.POSITIVE_INFINITY)).toThrow(MoneyError);
    expect(() => toMinor(-1)).toThrow(MoneyError);
    expect(() => toMinor(1e21)).toThrow(MoneyError);
    expect(() => toMinor("1000000000.01")).toThrow(MoneyError);
    expect(toMinor("1000000000")).toBe(100_000_000_000);
  });
});

describe("rates", () => {
  it("normalises to a canonical string", () => {
    expect(normaliseRate("26.50")).toBe("26.5");
    expect(normaliseRate(27)).toBe("27");
    expect(normaliseRate("26.123456789")).toBe("26.123457");
  });
  it("rejects zero, empty and negative rates", () => {
    for (const bad of ["0", "", "-3", "x"]) expect(() => normaliseRate(bad), bad).toThrow(MoneyError);
    expect(() => normaliseRate(Number.NaN)).toThrow(MoneyError);
  });
});

describe("convertMinor", () => {
  it("converts both ways at a ZWG-per-USD rate", () => {
    expect(convertMinor(10000, "USD", "ZWG", "26.5")).toBe(265000);
    expect(convertMinor(265000, "ZWG", "USD", "26.5")).toBe(10000);
    expect(convertMinor(15000, "ZWG", "USD", "27")).toBe(556); // 5.5555... -> 5.56
    expect(convertMinor(1, "USD", "ZWG", "26.5")).toBe(26); // 26.5 -> half to even -> 26
    expect(convertMinor(3, "USD", "ZWG", "26.5")).toBe(80); // 79.5 -> half to even -> 80
  });
  it("leaves same-currency amounts alone and rejects bad input", () => {
    expect(convertMinor(123, "USD", "USD", "26.5")).toBe(123);
    expect(() => convertMinor(100, "USD", "ZWG", "0")).toThrow(MoneyError);
    expect(() => convertMinor(-1, "USD", "ZWG", "26")).toThrow(MoneyError);
    expect(() => convertMinor(1.5, "USD", "ZWG", "26")).toThrow(MoneyError);
  });
  it("never creates money on a round trip", () => {
    for (const rate of ["13.56", "26.5", "33", "40.123456"]) {
      for (let usd = 1; usd < 5000; usd += 37) {
        const back = convertMinor(convertMinor(usd, "USD", "ZWG", rate), "ZWG", "USD", rate);
        expect(Math.abs(back - usd), `${usd} at ${rate}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("helpers", () => {
  it("divides with half-to-even rounding", () => {
    expect(divRoundHalfEven(BigInt(5), BigInt(2))).toBe(BigInt(2));
    expect(divRoundHalfEven(BigInt(7), BigInt(2))).toBe(BigInt(4));
    expect(divRoundHalfEven(BigInt(10), BigInt(3))).toBe(BigInt(3));
    expect(() => divRoundHalfEven(BigInt(1), BigInt(0))).toThrow(MoneyError);
  });
  it("parses decimals at a scale", () => {
    expect(parseDecimal("1.5", 6)).toBe(BigInt(1500000));
  });
  it("formats for display and for inputs", () => {
    expect(formatMinor(1234567, "USD")).toBe("$12,345.67");
    expect(formatMinor(-5, "USD")).toBe("-$0.05");
    expect(formatMinor(265000, "ZWG")).toBe("ZiG 2,650.00");
    expect(formatMinor(0, "ZWG", { symbol: false })).toBe("0.00");
    expect(minorToInput(123456)).toBe("1234.56");
  });
});

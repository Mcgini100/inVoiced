import { describe, expect, it } from "vitest";
import { type LegacyRow, mapLegacyRow } from "@/server/legacy";

const row: LegacyRow = { id: "1", type: "INCOME", context: "BUSINESS", amount: 20.1, currency: "USD", method: "INNSBUCKS", description: "maize", streetRate: 25, createdAt: 1763978400000 };

describe("mapLegacyRow", () => {
  it("maps income and expenses, fixing the old method spelling and float amounts", () => {
    const res = mapLegacyRow(row);
    expect(res).toMatchObject({ ok: true, data: { type: "INCOME", amountMinor: 2010, method: "INNBUCKS", rate: "25", source: "IMPORT", toCurrency: null } });
    if (res.ok) expect(res.data.createdAt?.toISOString()).toBe("2025-11-24T10:00:00.000Z");
  });
  it("turns a transfer into two explicit legs using its saved rate", () => {
    expect(mapLegacyRow({ ...row, type: "TRANSFER", amount: 10 })).toMatchObject({ ok: true, data: { amountMinor: 1000, toCurrency: "ZWG", toAmountMinor: 25000 } });
    expect(mapLegacyRow({ ...row, type: "TRANSFER", currency: "ZWG", amount: 250 })).toMatchObject({ ok: true, data: { toCurrency: "USD", toAmountMinor: 1000 } });
  });
  it("skips rows it cannot map safely instead of guessing", () => {
    expect(mapLegacyRow({ ...row, type: "TRANSFER", streetRate: null }).ok).toBe(false);
    expect(mapLegacyRow({ ...row, amount: 0 }).ok).toBe(false);
    expect(mapLegacyRow({ ...row, amount: Number.NaN }).ok).toBe(false);
    expect(mapLegacyRow({ ...row, currency: "ZAR" }).ok).toBe(false);
    expect(mapLegacyRow({ ...row, type: "OTHER" }).ok).toBe(false);
    expect(mapLegacyRow({ ...row, createdAt: "not a date" }).ok).toBe(false);
  });
  it("accepts ISO dates and unknown contexts", () => {
    expect(mapLegacyRow({ ...row, createdAt: "2026-01-02T03:04:05.000Z", context: "??" })).toMatchObject({ ok: true, data: { context: "PERSONAL" } });
  });
});

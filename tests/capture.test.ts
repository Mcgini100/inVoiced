import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import { MemoryRepo } from "@/server/repo/memory";
import { MAX_AUDIO_BYTES, type Extractor, type Transcriber, checkAudio, processCapture } from "@/server/services/capture";
import { createEntry, getDashboard, setMyRate } from "@/server/services/ledger";
import { makeLedger } from "./helpers";

const audio = { bytes: new Uint8Array([1, 2, 3]), mime: "audio/webm", filename: "recording.webm" };
const says = (text: string): Transcriber => ({ transcribe: async () => text });
const returns = (value: unknown): Extractor => ({ extract: async () => value });

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof AppError) return e.code;
    throw e;
  }
  return "NO_ERROR";
}

const sale = { type: "INCOME", context: "BUSINESS", amount: 20, currency: "USD", method: "ECOCASH", description: "two bags of maize" };

describe("checkAudio", () => {
  it("accepts what phones actually record and names the file honestly", () => {
    expect(checkAudio("audio/webm;codecs=opus", 1000)).toEqual({ mime: "audio/webm", filename: "recording.webm" });
    expect(checkAudio("audio/mp4", 1000)).toEqual({ mime: "audio/mp4", filename: "recording.mp4" });
    expect(checkAudio("Audio/OGG; codecs=opus", 1000).filename).toBe("recording.ogg");
  });
  it("rejects other types, empty and oversized uploads", () => {
    for (const type of ["", "video/mp4", "application/octet-stream", "text/html"]) expect(() => checkAudio(type, 10), type).toThrow(AppError);
    expect(() => checkAudio("audio/webm", 0)).toThrow(AppError);
    expect(() => checkAudio("audio/webm", MAX_AUDIO_BYTES + 1)).toThrow(AppError);
  });
});

describe("processCapture", () => {
  it("records a spoken sale with its transcript", async () => {
    const ctx = await makeLedger(new MemoryRepo());
    const res = await processCapture(ctx, { transcriber: says(" sold two bags of maize for twenty US on EcoCash "), extractor: returns({ isCorrection: false, newTransaction: sale }) }, audio);
    expect(res.isCorrection).toBe(false);
    expect(res.transaction).toMatchObject({ type: "INCOME", amountMinor: 2000, currency: "USD", method: "ECOCASH", source: "VOICE", transcript: "sold two bags of maize for twenty US on EcoCash" });
    expect((await getDashboard(ctx)).balances.USD).toBe(2000);
  });

  it("applies a correction to the last entry using only allowed fields", async () => {
    const ctx = await makeLedger(new MemoryRepo());
    const first = await createEntry(ctx, { type: "EXPENSE", context: "PERSONAL", amount: "150", currency: "USD", method: "CASH" });
    const hostile = { isCorrection: true, updates: { currency: "ZWG", id: "other-id", businessId: "other-business", status: "VOID", amountMinor: 1, createdById: "x" } };
    const res = await processCapture(ctx, { transcriber: says("change that to bonds"), extractor: returns(hostile) }, audio);
    expect(res.isCorrection).toBe(true);
    expect(res.transaction).toMatchObject({ id: first.id, businessId: ctx.businessId, currency: "ZWG", amountMinor: 15000, status: "POSTED", createdById: ctx.userId });
  });

  it("refuses a correction when there is nothing to correct or nothing valid to change", async () => {
    const ctx = await makeLedger(new MemoryRepo());
    const ai = (v: unknown) => ({ transcriber: says("change it"), extractor: returns(v) });
    expect(await codeOf(processCapture(ctx, ai({ isCorrection: true, updates: { amount: 5 } }), audio))).toBe("VALIDATION");
    await createEntry(ctx, { type: "EXPENSE", context: "PERSONAL", amount: "150", currency: "USD", method: "CASH" });
    expect(await codeOf(processCapture(ctx, ai({ isCorrection: true, updates: {} }), audio))).toBe("VALIDATION");
    expect(await codeOf(processCapture(ctx, ai({ isCorrection: true, updates: { amount: -5 } }), audio))).toBe("VALIDATION");
    expect(await codeOf(processCapture(ctx, ai({ isCorrection: true, updates: { type: "TRANSFER" } }), audio))).toBe("VALIDATION");
    expect((await getDashboard(ctx)).balances.USD).toBe(-15000);
  });

  it("rejects malformed or out-of-range model output without writing anything", async () => {
    const ctx = await makeLedger(new MemoryRepo());
    const bad: unknown[] = [
      null, "text", 42, [], {}, { isCorrection: "no" }, { isCorrection: false }, { isCorrection: false, newTransaction: {} },
      { isCorrection: false, newTransaction: { ...sale, amount: 0 } },
      { isCorrection: false, newTransaction: { ...sale, amount: -20 } },
      { isCorrection: false, newTransaction: { ...sale, amount: "20" } },
      { isCorrection: false, newTransaction: { ...sale, currency: "BTC" } },
      { isCorrection: false, newTransaction: { ...sale, method: "INNSBUCKS" } },
      { isCorrection: false, newTransaction: { ...sale, type: "REFUND" } },
      { isCorrection: false, newTransaction: { ...sale, description: "x".repeat(500) } },
    ];
    for (const value of bad) {
      expect(await codeOf(processCapture(ctx, { transcriber: says("hello"), extractor: returns(value) }, audio)), JSON.stringify(value)).toBe("VALIDATION");
    }
    expect((await getDashboard(ctx)).transactions).toHaveLength(0);
  });

  it("rejects silence before calling the extractor", async () => {
    const ctx = await makeLedger(new MemoryRepo());
    let called = false;
    const extractor: Extractor = { extract: async () => ((called = true), null) };
    expect(await codeOf(processCapture(ctx, { transcriber: says("   "), extractor }, audio))).toBe("VALIDATION");
    expect(called).toBe(false);
  });

  it("records a spoken exchange only when a rate is set, with both legs fixed", async () => {
    const ctx = await makeLedger(new MemoryRepo());
    const ai = { transcriber: says("changed fifty US to zig"), extractor: returns({ isCorrection: false, newTransaction: { ...sale, type: "TRANSFER", amount: 50 } }) };
    expect(await codeOf(processCapture(ctx, ai, audio))).toBe("VALIDATION");
    await setMyRate(ctx, "27");
    const res = await processCapture(ctx, ai, audio);
    expect(res.transaction).toMatchObject({ type: "TRANSFER", amountMinor: 5000, currency: "USD", toCurrency: "ZWG", toAmountMinor: 135000, rate: "27" });
  });

  it("passes the last entry to the extractor as context", async () => {
    const ctx = await makeLedger(new MemoryRepo());
    const first = await createEntry(ctx, { type: "INCOME", context: "BUSINESS", amount: "5", currency: "USD", method: "CASH" });
    let seen: string | undefined;
    const extractor: Extractor = { extract: async (_t, last) => ((seen = last?.id), { isCorrection: false, newTransaction: sale }) };
    await processCapture(ctx, { transcriber: says("another one"), extractor }, audio);
    expect(seen).toBe(first.id);
  });
});

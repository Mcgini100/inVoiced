import { z } from "zod";
import type { Transaction } from "@/lib/domain";
import { AppError } from "@/lib/errors";
import { VoiceNewSchema, VoiceUpdatesSchema } from "../schemas";
import { type LedgerCtx, createEntry, createTransfer, editTransaction } from "./ledger";

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const ALLOWED_AUDIO_TYPES = ["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/aac"] as const;

const EXTENSION: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
};

export interface AudioInput {
  bytes: Uint8Array;
  /** Base MIME type without parameters, already checked against the allow-list. */
  mime: string;
  filename: string;
}

export interface Transcriber {
  transcribe(audio: AudioInput): Promise<string>;
}

export interface Extractor {
  /** Returns the model's raw JSON. It is untrusted and validated by the caller. */
  extract(transcript: string, last: Transaction | null): Promise<unknown>;
}

export interface CaptureResult {
  transcript: string;
  transaction: Transaction;
  isCorrection: boolean;
}

/** Validates an uploaded blob's type and size and gives it an honest file name. */
export function checkAudio(type: string, size: number): { mime: string; filename: string } {
  const mime = type.split(";")[0].trim().toLowerCase();
  if (!(ALLOWED_AUDIO_TYPES as readonly string[]).includes(mime)) {
    throw new AppError("VALIDATION", "That audio format is not supported.");
  }
  if (size <= 0) throw new AppError("VALIDATION", "The recording was empty.");
  if (size > MAX_AUDIO_BYTES) throw new AppError("VALIDATION", "The recording is too long. Keep it under a minute.");
  return { mime, filename: `recording.${EXTENSION[mime]}` };
}

const NOT_UNDERSTOOD = "Sorry, I couldn't understand that as a transaction. Please try again.";
const Envelope = z.object({ isCorrection: z.boolean(), updates: z.unknown().optional(), newTransaction: z.unknown().optional() });

export async function processCapture(
  ctx: LedgerCtx,
  ai: { transcriber: Transcriber; extractor: Extractor },
  audio: AudioInput,
): Promise<CaptureResult> {
  const transcript = (await ai.transcriber.transcribe(audio)).trim();
  if (!transcript) throw new AppError("VALIDATION", "I couldn't hear anything. Please try again.");
  const last = await ctx.repo.lastPosted();
  const envelope = Envelope.safeParse(await ai.extractor.extract(transcript, last));
  if (!envelope.success) throw new AppError("VALIDATION", NOT_UNDERSTOOD);

  if (envelope.data.isCorrection) {
    if (!last) throw new AppError("VALIDATION", "There is no earlier transaction to correct.");
    const updates = VoiceUpdatesSchema.safeParse(envelope.data.updates);
    if (!updates.success) throw new AppError("VALIDATION", NOT_UNDERSTOOD);
    const transaction = await editTransaction(ctx, last.id, updates.data);
    return { transcript, transaction, isCorrection: true };
  }

  const parsed = VoiceNewSchema.safeParse(envelope.data.newTransaction);
  if (!parsed.success) throw new AppError("VALIDATION", NOT_UNDERSTOOD);
  const tx = parsed.data;
  const meta = { source: "VOICE" as const, transcript };
  if (tx.type === "TRANSFER") {
    const { myRate } = await ctx.repo.getBusiness();
    if (!myRate) throw new AppError("VALIDATION", "Set your exchange rate first, then record the exchange again.");
    const transaction = await createTransfer(
      ctx,
      { amount: tx.amount, fromCurrency: tx.currency, method: tx.method, description: tx.description, rate: myRate },
      meta,
    );
    return { transcript, transaction, isCorrection: false };
  }
  const transaction = await createEntry(
    ctx,
    { type: tx.type, context: tx.context, amount: tx.amount, currency: tx.currency, method: tx.method, description: tx.description },
    meta,
  );
  return { transcript, transaction, isCorrection: false };
}

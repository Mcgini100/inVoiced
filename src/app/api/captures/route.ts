import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { AppError, statusOf, toPublicError } from "@/lib/errors";
import { errorFields, log } from "@/lib/log";
import { createOpenAiProviders } from "@/server/ai/openai";
import { getRepo, requireLedger } from "@/server/context";
import { enforceLimit } from "@/server/ratelimit";
import { MAX_AUDIO_BYTES, checkAudio, processCapture } from "@/server/services/capture";
import { getDashboard } from "@/server/services/ledger";

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients; the session cookie is still required
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    if (!sameOrigin(req)) throw new AppError("FORBIDDEN", "Request not allowed.");
    const ctx = await requireLedger();

    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_AUDIO_BYTES + 64 * 1024) throw new AppError("VALIDATION", "The recording is too long. Keep it under a minute.");

    const e = env();
    const now = new Date();
    await enforceLimit(getRepo(), `capture:user:${ctx.userId}`, 20, 60, now);
    await enforceLimit(getRepo(), `capture:day:${ctx.businessId}`, e.CAPTURE_DAILY_LIMIT, 86400, now, "You have reached today's voice limit. You can still add entries by hand.");
    if (!e.OPENAI_API_KEY) throw new AppError("NOT_CONFIGURED", "Voice capture is not set up on this server yet.");

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) throw new AppError("VALIDATION", "No recording was received.");
    const { mime, filename } = checkAudio(audio.type, audio.size);

    const ai = createOpenAiProviders({ apiKey: e.OPENAI_API_KEY, asrModel: e.ASR_MODEL, asrLanguage: e.ASR_LANGUAGE, extractModel: e.EXTRACT_MODEL });
    const result = await processCapture(ctx, ai, { bytes: new Uint8Array(await audio.arrayBuffer()), mime, filename });
    log("info", "capture.ok", { businessId: ctx.businessId, ms: Date.now() - started, bytes: audio.size, mime, isCorrection: result.isCorrection });
    return NextResponse.json({ ...result, dashboard: await getDashboard(ctx) });
  } catch (err) {
    if (!(err instanceof AppError)) log("error", "capture.failed", errorFields(err));
    else if (err.code === "UPSTREAM") log("error", "capture.upstream", errorFields(err.cause));
    return NextResponse.json({ error: toPublicError(err) }, { status: statusOf(err) });
  }
}

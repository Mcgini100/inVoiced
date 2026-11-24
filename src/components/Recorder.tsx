"use client";

import { Loader2, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { DashboardData } from "@/lib/domain";

const MAX_SECONDS = 60;
const CANDIDATE_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

const EXTENSIONS: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "mp4", "audio/ogg": "ogg" };

/** Safari records audio/mp4, Chrome and Firefox record webm or ogg: ask the browser instead of assuming. */
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

interface CaptureResponse {
  transcript: string;
  isCorrection: boolean;
  dashboard: DashboardData;
}

interface Props {
  online: boolean;
  onResult: (dashboard: DashboardData, message: string) => void;
  onError: (message: string) => void;
  onUnauthorized: () => void;
}

export function Recorder({ online, onResult, onError, onUnauthorized }: Props) {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle");
  const [transcript, setTranscript] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
        rec.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const upload = async (blob: Blob) => {
    try {
      const base = blob.type.split(";")[0];
      const form = new FormData();
      form.append("audio", blob, `recording.${EXTENSIONS[base] ?? "webm"}`);
      const res = await fetch("/api/captures", { method: "POST", body: form });
      if (res.status === 401) return onUnauthorized();
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok || !body) {
        const message = (body as { error?: { message?: string } } | null)?.error?.message;
        return onError(message ?? "Could not process the recording. Please try again.");
      }
      const data = body as CaptureResponse;
      setTranscript(data.transcript);
      onResult(data.dashboard, data.isCorrection ? "Updated your last entry." : "Saved.");
    } catch {
      onError("Network problem. Check your connection and try again.");
    } finally {
      setState("idle");
    }
  };

  const stop = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") {
      setState("processing");
      rec.stop();
    }
  };

  const start = async () => {
    if (!online) return onError("You are offline. Voice needs a connection; you can still add an entry by hand.");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return onError("This browser cannot record audio. Add the entry by hand instead.");
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return onError("Microphone access is needed to record. Allow it in your browser settings.");
    }
    const mimeType = pickMimeType();
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      void upload(new Blob(chunks, { type: rec.mimeType || mimeType || "audio/webm" }));
    };
    recorderRef.current = rec;
    setTranscript("");
    rec.start();
    setState("recording");
    timerRef.current = setTimeout(stop, MAX_SECONDS * 1000);
  };

  const label = state === "processing" ? "Working on it..." : state === "recording" ? "Listening... tap to stop" : "Tap and say what happened";

  return (
    <div className="flex flex-col items-center justify-center w-full mb-8">
      <div className={`relative rounded-full p-2 mb-6 ${state === "recording" ? "recording-pulse-mode" : ""}`}>
        <button
          type="button"
          aria-label={state === "recording" ? "Stop recording" : "Record a transaction"}
          disabled={state === "processing"}
          onClick={() => (state === "recording" ? stop() : void start())}
          className={`w-28 h-28 rounded-full flex items-center justify-center transition-all bg-red-600 hover:bg-red-700 text-white shadow-xl disabled:opacity-80 ${
            state === "recording" ? "scale-105" : ""
          }`}
        >
          {state === "processing" ? <Loader2 size={40} className="animate-spin" /> : state === "recording" ? <Square size={40} fill="currentColor" /> : <Mic size={40} />}
        </button>
      </div>
      <div className="text-center min-h-16">
        <p className="text-xs font-medium opacity-70 mb-2 uppercase tracking-widest" aria-live="polite">
          {label}
        </p>
        {transcript && (
          <p className="font-mono text-xs border-l-2 border-[var(--color-mint)] pl-3 text-left italic line-clamp-2 opacity-80">&ldquo;{transcript}&rdquo;</p>
        )}
      </div>
    </div>
  );
}

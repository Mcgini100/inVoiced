"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestOtpAction, verifyOtpAction } from "@/app/actions";

export function LoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestCode = () =>
    startTransition(async () => {
      setError(null);
      const res = await requestOtpAction(phone);
      if (!res.ok) return setError(res.error.message);
      setSentTo(res.data.phone);
      setDevCode(res.data.devCode ?? null);
      setCode("");
    });

  const verify = () =>
    startTransition(async () => {
      setError(null);
      const res = await verifyOtpAction(sentTo ?? phone, code);
      if (!res.ok) return setError(res.error.message);
      router.replace("/");
      router.refresh();
    });

  return (
    <main className="min-h-screen p-6 flex flex-col justify-center max-w-sm mx-auto">
      <h1 className="font-bold text-2xl tracking-wide mb-1">inVoiced</h1>
      <p className="text-sm opacity-70 mb-8">Say it, and it&apos;s in your books.</p>

      {sentTo === null ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            requestCode();
          }}
        >
          <label className="block text-xs uppercase tracking-widest opacity-70" htmlFor="phone">
            Phone number
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0771234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="tactical-input text-lg"
            required
          />
          <button type="submit" disabled={pending} className="tactical-button w-full disabled:opacity-50">
            {pending ? "Sending..." : "Send me a code"}
          </button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
        >
          <p className="text-sm">
            Enter the 6-digit code sent to <span className="font-mono font-bold">{sentTo}</span>.
          </p>
          {devCode && (
            <p className="text-xs font-mono p-2 rounded border border-dashed border-[var(--color-record-flash)]">
              Development mode. Your code is {devCode}
            </p>
          )}
          <input
            aria-label="Sign-in code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="tactical-input text-2xl font-mono tracking-[0.5em] text-center"
            required
          />
          <button type="submit" disabled={pending || code.length !== 6} className="tactical-button w-full disabled:opacity-50">
            {pending ? "Checking..." : "Sign in"}
          </button>
          <button type="button" onClick={() => setSentTo(null)} className="w-full text-sm underline opacity-70 py-2">
            Use a different number
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </main>
  );
}

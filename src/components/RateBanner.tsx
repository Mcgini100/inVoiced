"use client";

import { Edit3, Save } from "lucide-react";
import { useState } from "react";
import { setRateAction } from "@/app/actions";
import type { Submit } from "./Dashboard";

export function RateBanner({ rate, submit }: { rate: string | null; submit: Submit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const ok = await submit(() => setRateAction(draft.trim() === "" ? null : draft.trim()), "Rate saved.");
    setBusy(false);
    if (ok) setEditing(false);
  };

  return (
    <div className="w-full mb-6 tactical-container p-3 rounded-lg flex justify-between items-center">
      <div className="flex flex-col">
        <label htmlFor="my-rate" className="text-[10px] uppercase tracking-widest opacity-60">
          My rate (ZiG for 1 USD)
        </label>
        {editing ? (
          <input
            id="my-rate"
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. 27"
            className="bg-transparent border-b border-[var(--color-mint)] outline-none text-sm font-mono w-28 mt-1 py-1"
            autoFocus
          />
        ) : (
          <span className="text-sm font-mono mt-1 font-bold">{rate ? `1 USD = ${rate} ZiG` : "Not set"}</span>
        )}
      </div>
      <button
        type="button"
        aria-label={editing ? "Save rate" : "Change rate"}
        disabled={busy}
        onClick={() => {
          if (editing) void save();
          else {
            setDraft(rate ?? "");
            setEditing(true);
          }
        }}
        className="text-[var(--color-mint)] p-3 bg-[var(--color-mint)]/10 rounded-md disabled:opacity-50"
      >
        {editing ? <Save size={18} /> : <Edit3 size={18} />}
      </button>
    </div>
  );
}

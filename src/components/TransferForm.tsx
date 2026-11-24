"use client";

import { useState } from "react";
import { transferAction } from "@/app/actions";
import { type Currency, otherCurrency } from "@/lib/domain";
import { convertMinor, formatMinor, toMinor } from "@/lib/money";
import type { Submit } from "./Dashboard";
import { AmountInput, CurrencySelect, DescriptionInput, MethodSelect } from "./fields";

function preview(amount: string, from: Currency, rate: string): string | null {
  try {
    const to = otherCurrency(from);
    return formatMinor(convertMinor(toMinor(amount), from, to, rate), to);
  } catch {
    return null;
  }
}

export function TransferForm({ defaultRate, submit, onDone }: { defaultRate: string | null; submit: Submit; onDone: () => void }) {
  const [form, setForm] = useState({ amount: "", fromCurrency: "USD", method: "CASH", description: "", rate: defaultRate ?? "" });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const from = form.fromCurrency as Currency;
  const received = preview(form.amount, from, form.rate);

  return (
    <form
      className="w-full mb-6 tactical-container p-4 rounded-lg space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await submit(() => transferAction(form), "Exchange recorded.");
        setBusy(false);
        if (ok) onDone();
      }}
    >
      <h2 className="text-xs font-bold uppercase tracking-wider">Exchange between USD and ZiG</h2>
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-sm">I gave</span>
        <AmountInput value={form.amount} onChange={set("amount")} />
        <CurrencySelect value={form.fromCurrency} onChange={set("fromCurrency")} label="Currency given" />
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <label htmlFor="transfer-rate" className="text-sm">
          at 1 USD =
        </label>
        <input
          id="transfer-rate"
          type="text"
          inputMode="decimal"
          value={form.rate}
          onChange={(e) => set("rate")(e.target.value)}
          placeholder="rate"
          className="w-24 bg-[var(--border-color)] p-2 rounded font-mono text-sm min-h-11"
        />
        <span className="text-sm">ZiG</span>
      </div>
      <p className="text-sm font-mono min-h-5" aria-live="polite">
        {received ? `I received ${received}` : ""}
      </p>
      <MethodSelect value={form.method} onChange={set("method")} />
      <DescriptionInput value={form.description} onChange={set("description")} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="px-4 py-3 text-sm opacity-70">
          Cancel
        </button>
        <button type="submit" disabled={busy || !received} className="tactical-button disabled:opacity-50">
          {busy ? "Saving..." : "Record exchange"}
        </button>
      </div>
    </form>
  );
}

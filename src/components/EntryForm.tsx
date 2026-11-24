"use client";

import { useState } from "react";
import { addEntryAction } from "@/app/actions";
import type { Submit } from "./Dashboard";
import { AmountInput, ContextSelect, CurrencySelect, DescriptionInput, MethodSelect, TypeSelect } from "./fields";

export function EntryForm({ submit, onDone }: { submit: Submit; onDone: () => void }) {
  const [form, setForm] = useState({ type: "INCOME", amount: "", currency: "USD", method: "CASH", context: "BUSINESS", description: "" });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <form
      className="w-full mb-6 tactical-container p-4 rounded-lg space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await submit(() => addEntryAction(form), "Saved.");
        setBusy(false);
        if (ok) onDone();
      }}
    >
      <h2 className="text-xs font-bold uppercase tracking-wider">Add an entry</h2>
      <div className="flex gap-2 flex-wrap">
        <TypeSelect value={form.type} onChange={set("type")} />
        <AmountInput value={form.amount} onChange={set("amount")} />
        <CurrencySelect value={form.currency} onChange={set("currency")} />
      </div>
      <div className="flex gap-2">
        <MethodSelect value={form.method} onChange={set("method")} />
        <ContextSelect value={form.context} onChange={set("context")} />
      </div>
      <DescriptionInput value={form.description} onChange={set("description")} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="px-4 py-3 text-sm opacity-70">
          Cancel
        </button>
        <button type="submit" disabled={busy || form.amount.trim() === ""} className="tactical-button disabled:opacity-50">
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

"use client";

import { Edit3, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteTransactionAction, editTransactionAction } from "@/app/actions";
import { METHOD_LABELS, type Transaction } from "@/lib/domain";
import { convertMinor, formatMinor, minorToInput } from "@/lib/money";
import type { Submit } from "./Dashboard";
import { AmountInput, ContextSelect, CurrencySelect, DescriptionInput, MethodSelect, TypeSelect } from "./fields";

const ACCENT = { INCOME: "#10b981", EXPENSE: "#ef4444", TRANSFER: "#f59e0b" } as const;
const AMOUNT_CLASS = { INCOME: "text-green-600 dark:text-green-400", EXPENSE: "text-red-600 dark:text-red-400", TRANSFER: "text-yellow-600 dark:text-yellow-400" } as const;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function TransactionList({ transactions, submit }: { transactions: Transaction[]; submit: Submit }) {
  return (
    <section className="w-full flex flex-col gap-3">
      <h2 className="text-xs font-bold uppercase tracking-wider opacity-60 px-2 border-b border-[var(--border-color)] pb-2 mb-1">Recent entries</h2>
      {transactions.length === 0 ? (
        <p className="text-sm opacity-60 px-2 mt-4 text-center">Nothing yet. Tap the button and say what happened.</p>
      ) : (
        transactions.map((tx) => <Row key={tx.id} tx={tx} submit={submit} />)
      )}
    </section>
  );
}

function Row({ tx, submit }: { tx: Transaction; submit: Submit }) {
  const [mode, setMode] = useState<"view" | "edit" | "confirmDelete">("view");
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    const ok = await submit(() => deleteTransactionAction(tx.id), "Deleted.");
    setBusy(false);
    if (!ok) setMode("view");
  };

  return (
    <div className="tactical-container p-3 rounded-md flex flex-col border-l-2" style={{ borderLeftColor: ACCENT[tx.type] }}>
      {mode === "edit" ? (
        <EditForm tx={tx} submit={submit} onDone={() => setMode("view")} />
      ) : (
        <>
          <div className="flex justify-between items-center w-full gap-3">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider bg-[var(--border-color)]">{METHOD_LABELS[tx.method]}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider bg-[var(--border-color)] opacity-80">{tx.context}</span>
              </div>
              <span className="text-sm font-medium break-words">{tx.description || "No description"}</span>
              <time dateTime={tx.createdAt} className="text-[10px] opacity-60 font-mono mt-1" suppressHydrationWarning>
                {formatWhen(tx.createdAt)}
              </time>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Amount tx={tx} />
              <button type="button" aria-label="Edit entry" onClick={() => setMode("edit")} className="p-4 rounded opacity-70">
                <Edit3 size={16} />
              </button>
              <button type="button" aria-label="Delete entry" onClick={() => setMode("confirmDelete")} className="p-4 rounded text-red-600 dark:text-red-400">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          {mode === "confirmDelete" && (
            <div className="flex justify-end items-center gap-2 mt-3 pt-3 border-t border-[var(--border-color)]">
              <span className="text-sm mr-auto">Delete this entry?</span>
              <button type="button" onClick={() => setMode("view")} className="px-4 py-3 text-sm opacity-70">
                Keep
              </button>
              <button type="button" disabled={busy} onClick={() => void remove()} className="px-4 py-3 text-sm font-bold rounded bg-red-600 text-white disabled:opacity-50">
                {busy ? "Deleting..." : "Delete"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Amount({ tx }: { tx: Transaction }) {
  if (tx.type === "TRANSFER" && tx.toCurrency && tx.toAmountMinor != null) {
    return (
      <div className={`text-sm font-mono font-bold text-right ${AMOUNT_CLASS.TRANSFER}`}>
        <div>-{formatMinor(tx.amountMinor, tx.currency)}</div>
        <div>+{formatMinor(tx.toAmountMinor, tx.toCurrency)}</div>
        {tx.rate && <div className="text-[10px] opacity-70 font-normal">at {tx.rate}</div>}
      </div>
    );
  }
  const usd = tx.currency === "ZWG" && tx.rate ? convertMinor(tx.amountMinor, "ZWG", "USD", tx.rate) : null;
  return (
    <div className="text-sm font-mono font-bold text-right">
      <div className={AMOUNT_CLASS[tx.type]}>
        {tx.type === "INCOME" ? "+" : "-"}
        {formatMinor(tx.amountMinor, tx.currency)}
      </div>
      {usd !== null && <div className="text-[10px] opacity-60 font-normal">about {formatMinor(usd, "USD")}</div>}
    </div>
  );
}

function EditForm({ tx, submit, onDone }: { tx: Transaction; submit: Submit; onDone: () => void }) {
  const isTransfer = tx.type === "TRANSFER";
  const [form, setForm] = useState({
    type: isTransfer ? "EXPENSE" : tx.type,
    amount: minorToInput(tx.amountMinor),
    currency: tx.currency as string,
    method: tx.method as string,
    context: tx.context as string,
    description: tx.description ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setBusy(true);
    // An exchange keeps its amounts; only its method and description can change.
    const input = isTransfer ? { method: form.method, description: form.description } : form;
    const ok = await submit(() => editTransactionAction(tx.id, input), "Updated.");
    setBusy(false);
    if (ok) onDone();
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {isTransfer ? (
        <p className="text-xs opacity-70">To change the amounts of an exchange, delete it and record it again.</p>
      ) : (
        <div className="flex gap-2 flex-wrap">
          <TypeSelect value={form.type} onChange={set("type")} />
          <AmountInput value={form.amount} onChange={set("amount")} />
          <CurrencySelect value={form.currency} onChange={set("currency")} />
        </div>
      )}
      <div className="flex gap-2">
        <MethodSelect value={form.method} onChange={set("method")} />
        {!isTransfer && <ContextSelect value={form.context} onChange={set("context")} />}
      </div>
      <DescriptionInput value={form.description} onChange={set("description")} />
      <div className="flex justify-end gap-2 pt-1 border-t border-[var(--border-color)]">
        <button type="button" onClick={onDone} className="px-4 py-3 text-sm opacity-70">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="px-4 py-3 text-sm bg-[var(--color-mint)]/20 text-[var(--color-mint)] font-bold rounded disabled:opacity-50">
          {busy ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

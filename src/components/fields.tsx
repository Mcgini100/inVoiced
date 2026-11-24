"use client";

import { CONTEXTS, CURRENCIES, METHODS, METHOD_LABELS } from "@/lib/domain";

const selectClass = "bg-[var(--border-color)] p-2 rounded text-sm min-h-11";

export function CurrencySelect({ value, onChange, label = "Currency" }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c === "ZWG" ? "ZiG" : c}
        </option>
      ))}
    </select>
  );
}

export function MethodSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select aria-label="Payment method" value={value} onChange={(e) => onChange(e.target.value)} className={`${selectClass} flex-1`}>
      {METHODS.map((m) => (
        <option key={m} value={m}>
          {METHOD_LABELS[m]}
        </option>
      ))}
    </select>
  );
}

export function ContextSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select aria-label="Business or personal" value={value} onChange={(e) => onChange(e.target.value)} className={`${selectClass} flex-1`}>
      {CONTEXTS.map((c) => (
        <option key={c} value={c}>
          {c === "BUSINESS" ? "Business" : "Personal"}
        </option>
      ))}
    </select>
  );
}

export function TypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select aria-label="Money in or out" value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      <option value="INCOME">Money in</option>
      <option value="EXPENSE">Money out</option>
    </select>
  );
}

export function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      aria-label="Amount"
      type="text"
      inputMode="decimal"
      placeholder="0.00"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-28 bg-[var(--border-color)] p-2 rounded font-mono text-sm min-h-11"
    />
  );
}

export function DescriptionInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      aria-label="Description"
      type="text"
      maxLength={200}
      placeholder="What was it for?"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[var(--border-color)] p-2 rounded text-sm min-h-11"
    />
  );
}

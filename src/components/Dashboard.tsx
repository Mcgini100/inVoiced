"use client";

import { ArrowLeftRight, LogOut, Plus, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type Result, loadMoreAction, logoutAction } from "@/app/actions";
import type { DashboardData } from "@/lib/domain";
import { convertMinor, formatMinor } from "@/lib/money";
import { EntryForm } from "./EntryForm";
import { RateBanner } from "./RateBanner";
import { Recorder } from "./Recorder";
import { ThemeToggle } from "./ThemeToggle";
import { TransactionList } from "./TransactionList";
import { TransferForm } from "./TransferForm";
import { useOnline } from "./hooks";

type Notice = { kind: "ok" | "error"; text: string } | null;
type Panel = "none" | "entry" | "transfer";

/** Runs a server action and returns true if it succeeded. Shared by every form on the page. */
export type Submit = (action: () => Promise<Result<DashboardData>>, success?: string) => Promise<boolean>;

export function Dashboard({ initial }: { initial: DashboardData }) {
  const router = useRouter();
  const online = useOnline();
  const [data, setData] = useState(initial);
  const [notice, setNotice] = useState<Notice>(null);
  const [panel, setPanel] = useState<Panel>("none");
  const [loadingMore, startLoadMore] = useTransition();

  const toLogin = () => {
    router.replace("/login");
    router.refresh();
  };

  const submit: Submit = async (action, success) => {
    let res: Result<DashboardData>;
    try {
      res = await action();
    } catch {
      setNotice({ kind: "error", text: "Network problem. Check your connection and try again." });
      return false;
    }
    if (!res.ok) {
      if (res.error.code === "UNAUTHORIZED") toLogin();
      else setNotice({ kind: "error", text: res.error.message });
      return false;
    }
    setData(res.data);
    setNotice(success ? { kind: "ok", text: success } : null);
    return true;
  };

  const loadMore = () =>
    startLoadMore(async () => {
      const res = await loadMoreAction(data.nextCursor);
      if (!res.ok) return setNotice({ kind: "error", text: res.error.message });
      setData((d) => ({ ...res.data, transactions: [...d.transactions, ...res.data.transactions] }));
    });

  const logout = async () => {
    await logoutAction();
    toLogin();
  };

  const { business, balances } = data;
  const zwgInUsd = business.myRate ? convertMinor(Math.abs(balances.ZWG), "ZWG", "USD", business.myRate) * Math.sign(balances.ZWG) : null;

  return (
    <main className="min-h-screen p-6 flex flex-col items-center max-w-lg mx-auto pb-16">
      <header className="w-full flex justify-between items-center mb-6 mt-4">
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-xl tracking-wide">inVoiced</h1>
          {!online && <WifiOff size={16} className="text-red-500 animate-pulse" aria-label="Offline" />}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button type="button" aria-label="Sign out" onClick={() => void logout()} className="tactical-container p-3 rounded-md">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={`w-full mb-4 p-3 rounded-md text-sm flex justify-between gap-3 border ${
            notice.kind === "error" ? "border-red-500 text-red-600 dark:text-red-400" : "border-[var(--color-mint)] text-[var(--color-mint)]"
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      <RateBanner rate={business.myRate} submit={submit} />

      <div className="w-full flex gap-4 mb-6">
        <div className="flex-1 tactical-container p-4 rounded-xl flex flex-col items-center justify-center border-t-2 border-t-green-500">
          <span className="text-[10px] uppercase tracking-widest opacity-60 mb-1">USD balance</span>
          <span className="text-2xl font-mono font-bold">{formatMinor(balances.USD, "USD")}</span>
        </div>
        <div className="flex-1 tactical-container p-4 rounded-xl flex flex-col items-center justify-center border-t-2 border-t-yellow-500">
          <span className="text-[10px] uppercase tracking-widest opacity-60 mb-1">ZiG balance</span>
          <span className="text-2xl font-mono font-bold">{formatMinor(balances.ZWG, "ZWG", { symbol: false })}</span>
          {zwgInUsd !== null && <span className="text-[10px] opacity-60 mt-1 font-mono">about {formatMinor(zwgInUsd, "USD")}</span>}
        </div>
      </div>

      <Recorder
        online={online}
        onResult={(dashboard, text) => {
          setData(dashboard);
          setNotice({ kind: "ok", text });
        }}
        onError={(text) => setNotice({ kind: "error", text })}
        onUnauthorized={toLogin}
      />

      <div className="w-full mb-6 flex gap-3">
        <button
          type="button"
          onClick={() => setPanel(panel === "entry" ? "none" : "entry")}
          className="flex-1 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-3 bg-[var(--border-color)] rounded-md"
        >
          <Plus size={14} /> Add by hand
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === "transfer" ? "none" : "transfer")}
          className="flex-1 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-3 bg-[var(--border-color)] rounded-md"
        >
          <ArrowLeftRight size={14} /> Exchange
        </button>
      </div>

      {panel === "entry" && <EntryForm submit={submit} onDone={() => setPanel("none")} />}
      {panel === "transfer" && <TransferForm defaultRate={business.myRate} submit={submit} onDone={() => setPanel("none")} />}

      <TransactionList transactions={data.transactions} submit={submit} />

      {data.nextCursor && (
        <button type="button" onClick={loadMore} disabled={loadingMore} className="mt-4 text-sm underline opacity-80 py-3 disabled:opacity-40">
          {loadingMore ? "Loading..." : "Show older entries"}
        </button>
      )}
    </main>
  );
}

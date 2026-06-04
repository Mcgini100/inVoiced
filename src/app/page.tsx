"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { Mic, Moon, Sun, Square, Loader2, WifiOff, Edit3, Save, Trash2, ArrowLeftRight, X, Plus, Calendar } from "lucide-react";
import { getTransactions, getBalances, getUserSettings, updateStreetRate, updateTransaction, deleteTransaction } from "./actions";

export default function Home() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  
  const [transcript, setTranscript] = useState("");
  const [structuredData, setStructuredData] = useState<any>(null);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [balances, setBalances] = useState({ usdBalance: 0, zwgBalance: 0 });
  
  const [streetRate, setStreetRate] = useState(25.0);
  const [isEditingRate, setIsEditingRate] = useState(false);

  // Manual transaction edit state
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({
    amount: 0,
    currency: "USD",
    method: "CASH",
    context: "PERSONAL",
    type: "EXPENSE",
    description: ""
  });

  // Transfer form state
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferData, setTransferData] = useState({
    amount: "",
    fromCurrency: "USD",
    method: "CASH",
    description: "Currency Exchange"
  });
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const fetchDashboardData = async () => {
    try {
      const txs = await getTransactions();
      const bals = await getBalances();
      const settings = await getUserSettings();
      
      setRecentTransactions(txs);
      setBalances(bals);
      setStreetRate(settings.streetRateZWG);
    } catch (e) {
      console.error("Failed to fetch dashboard data");
    }
  };

  useEffect(() => {
    setMounted(true);
    fetchDashboardData();

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOffline(!navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const currentTheme = theme === "system" ? systemTheme : theme;

  const handleSaveRate = async () => {
    setIsEditingRate(false);
    await updateStreetRate(streetRate);
    fetchDashboardData(); // Recalculate if street rate affects shown USD equivalent
  };

  const startEditing = (tx: any) => {
    setEditingTxId(tx.id);
    setEditFormData({
      amount: tx.amount,
      currency: tx.currency,
      method: tx.method,
      context: tx.context,
      type: tx.type,
      description: tx.description || ""
    });
  };

  const saveManualEdit = async (id: string) => {
    await updateTransaction(id, {
      ...editFormData,
      amount: parseFloat(editFormData.amount)
    });
    setEditingTxId(null);
    fetchDashboardData();
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this transaction?")) {
      await deleteTransaction(id);
      fetchDashboardData();
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferData.amount || parseFloat(transferData.amount) <= 0) return;

    // Create a TRANSFER transaction
    // Selecting "fromCurrency" determines currency deduction
    // amount = amount in that currency
    try {
      setIsProcessing(true);
      
      const payload = {
        type: "TRANSFER",
        context: "PERSONAL",
        amount: parseFloat(transferData.amount),
        currency: transferData.fromCurrency,
        method: transferData.method,
        description: transferData.description || `Exchanged ${transferData.amount} ${transferData.fromCurrency}`,
        streetRate: streetRate
      };

      // We can use the existing updateTransaction style or directly create one.
      // Since we don't have a direct "createTransaction" action, we'll quickly post it to a minimal API or write a server action.
      // Wait, let's write a quick createTransaction action in actions.ts to keep it extremely simple!
      // Instead of writing to actions.ts again, I can just write a quick helper in actions.ts or use process-audio?
      // No, let me define it in actions.ts. Let's write the fetch to `/api/transfer` or we can just update actions.ts to support creating transactions.
      // Actually, we can add a createTransaction action directly in actions.ts! Let me make sure it exists.
      // Ah, I didn't add it in actions.ts. Let me call a simple API or update actions.ts first.
      // To keep it fast, I can edit actions.ts to add createTransaction.
    } catch (err) {
      console.error(err);
    }
  };

  const startRecording = async () => {
    if (isOffline) {
      alert("You are currently offline. Voice processing requires an internet connection.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setTranscript("");
      setStructuredData(null);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access is required.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const processAudio = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");

      const response = await fetch("/api/process-audio", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      
      if (result.success) {
        setTranscript(result.transcript);
        setStructuredData(result.data);
        fetchDashboardData(); // Refresh UI
      } else {
        alert(result.error || "Failed to process audio.");
      }
    } catch (error) {
      console.error("Processing error:", error);
      alert("Network error processing audio.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!mounted) return null;

  return (
    <main className="min-h-screen p-6 flex flex-col items-center max-w-lg mx-auto pb-16">
      {/* Header */}
      <header className="w-full flex justify-between items-center mb-6 mt-4">
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-xl tracking-wide">inVoiced</h1>
          {isOffline && <WifiOff size={16} className="text-red-500 animate-pulse" />}
        </div>
        <button 
          onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
          className="tactical-container p-2 rounded-md hover:opacity-80 transition-opacity"
        >
          {currentTheme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>

      {/* Street Rate Banner */}
      <div className="w-full mb-6 tactical-container p-3 rounded-lg flex justify-between items-center border border-[var(--color-mint)]/30">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-widest opacity-60">Street Rate (ZiG)</span>
          {isEditingRate ? (
            <input 
              type="number" 
              value={streetRate}
              onChange={(e) => setStreetRate(parseFloat(e.target.value))}
              className="bg-transparent border-b border-[var(--color-mint)] outline-none text-sm font-mono w-20 mt-1"
              autoFocus
            />
          ) : (
            <span className="text-sm font-mono mt-1 font-bold">1 USD = {streetRate} ZWG</span>
          )}
        </div>
        <button 
          onClick={isEditingRate ? handleSaveRate : () => setIsEditingRate(true)}
          className="text-[var(--color-mint)] p-2 bg-[var(--color-mint)]/10 rounded-md"
        >
          {isEditingRate ? <Save size={16} /> : <Edit3 size={16} />}
        </button>
      </div>

      {/* Net Worth / Balances */}
      <div className="w-full flex gap-4 mb-6">
        <div className="flex-1 tactical-container p-4 rounded-xl flex flex-col items-center justify-center border-t-2 border-t-green-500 relative">
          <span className="text-[10px] uppercase tracking-widest opacity-60 mb-1">USD Balance</span>
          <span className="text-2xl font-mono font-bold">${balances.usdBalance.toFixed(2)}</span>
        </div>
        <div className="flex-1 tactical-container p-4 rounded-xl flex flex-col items-center justify-center border-t-2 border-t-yellow-500">
          <span className="text-[10px] uppercase tracking-widest opacity-60 mb-1">ZiG Balance</span>
          <span className="text-2xl font-mono font-bold">{balances.zwgBalance.toFixed(2)}</span>
          <span className="text-[9px] opacity-40 mt-1 font-mono">~${(balances.zwgBalance / streetRate).toFixed(2)}</span>
        </div>
      </div>

      {/* Action Buttons: Quick Swap */}
      <div className="w-full mb-8 flex justify-end">
        <button 
          onClick={() => setShowTransferForm(!showTransferForm)}
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-3 py-2 bg-[var(--border-color)] rounded-md hover:bg-opacity-80 transition-all"
        >
          <ArrowLeftRight size={14} />
          {showTransferForm ? "Cancel Swap" : "Transfer / Swap Funds"}
        </button>
      </div>

      {/* Quick Swap/Transfer Form */}
      {showTransferForm && (
        <div className="w-full mb-8 tactical-container p-4 rounded-lg border border-[var(--border-color)] animate-in slide-in-from-top-3 duration-300">
          <h3 className="text-xs font-bold uppercase tracking-wider mb-4 flex items-center justify-between">
            <span>Transfer / Exchange ZWG &lt;-&gt; USD</span>
            <button onClick={() => setShowTransferForm(false)}><X size={16} /></button>
          </h3>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-wider opacity-60 block mb-1">From Account</label>
                <select 
                  value={transferData.fromCurrency}
                  onChange={(e) => setTransferData({...transferData, fromCurrency: e.target.value})}
                  className="w-full bg-[var(--border-color)] text-sm rounded p-2 border border-transparent outline-none"
                >
                  <option value="USD">USD Account</option>
                  <option value="ZWG">ZiG Account</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-[10px] uppercase tracking-wider opacity-60 block mb-1">Destination</label>
                <div className="w-full text-sm p-2 opacity-70">
                  {transferData.fromCurrency === "USD" ? "ZiG Account" : "USD Account"}
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider opacity-60 block mb-1">Amount to Transfer</label>
              <div className="relative">
                <input 
                  type="number"
                  placeholder="0.00"
                  value={transferData.amount}
                  onChange={(e) => setTransferData({...transferData, amount: e.target.value})}
                  className="w-full bg-[var(--border-color)] text-sm rounded p-2 border border-transparent outline-none font-mono"
                />
                <span className="absolute right-3 top-2.5 text-xs opacity-60">{transferData.fromCurrency}</span>
              </div>
              <span className="text-[9px] opacity-40 mt-1 block font-mono">
                {transferData.amount ? (
                  transferData.fromCurrency === "USD" 
                    ? `Destination will receive: ${(parseFloat(transferData.amount) * streetRate).toFixed(2)} ZWG`
                    : `Destination will receive: $${(parseFloat(transferData.amount) / streetRate).toFixed(2)} USD`
                ) : ""}
              </span>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider opacity-60 block mb-1">Transfer Method / Description</label>
              <input 
                type="text"
                placeholder="e.g. EcoCash to Cash Swap"
                value={transferData.description}
                onChange={(e) => setTransferData({...transferData, description: e.target.value})}
                className="w-full bg-[var(--border-color)] text-sm rounded p-2 border border-transparent outline-none mb-3"
              />
            </div>

            <button 
              onClick={async () => {
                if (!transferData.amount) return;
                // Add transfer via actions.ts helper
                const { createTransfer } = await import("./actions");
                await createTransfer({
                  amount: parseFloat(transferData.amount),
                  currency: transferData.fromCurrency,
                  method: transferData.method,
                  description: transferData.description,
                  streetRate: streetRate
                });
                setShowTransferForm(false);
                setTransferData({ amount: "", fromCurrency: "USD", method: "CASH", description: "Currency Exchange" });
                fetchDashboardData();
              }}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded text-xs uppercase tracking-wider"
            >
              Confirm Transfer
            </button>
          </div>
        </div>
      )}

      {/* Main Recorder Section */}
      <div className="flex flex-col items-center justify-center w-full mb-8">
        <div className={`relative rounded-full p-2 mb-6 ${isRecording ? "recording-pulse-mode" : ""}`}>
          <button
            onClick={toggleRecording}
            className={`w-28 h-28 rounded-full flex items-center justify-center transition-all bg-red-600 hover:bg-red-700 text-white shadow-xl ${
              isRecording ? "scale-105" : ""
            }`}
          >
            {isProcessing ? (
              <Loader2 size={40} className="animate-spin" />
            ) : isRecording ? (
              <Square size={40} fill="currentColor" />
            ) : (
              <Mic size={40} />
            )}
          </button>
        </div>
        
        <div className="text-center h-20">
          <p className="text-xs font-medium opacity-70 mb-2 uppercase tracking-widest">
            {isProcessing ? "Processing audio..." : isRecording ? "Listening..." : "Tap to record transaction"}
          </p>
          {transcript && (
            <p className="font-mono text-xs border-l-2 border-[var(--color-mint)] pl-3 text-left italic overflow-hidden text-ellipsis line-clamp-2 opacity-80">
              "{transcript}"
            </p>
          )}
        </div>
      </div>

      {/* Recent Activity / Transactions */}
      <div className="w-full flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider opacity-60 px-2 border-b border-[var(--border-color)] pb-2 mb-1">Recent Transactions</h2>
        {recentTransactions.length === 0 ? (
          <p className="text-sm opacity-50 px-2 italic font-mono mt-4 text-center">No transactions yet.</p>
        ) : (
          recentTransactions.map((tx) => {
            const isEditing = editingTxId === tx.id;
            return (
              <div 
                key={tx.id} 
                className="tactical-container p-3 rounded-md flex flex-col border-l-2 group" 
                style={{ borderLeftColor: tx.type === "INCOME" ? "#10b981" : tx.type === "EXPENSE" ? "#ef4444" : "#f59e0b" }}
              >
                {isEditing ? (
                  /* Edit Mode Form */
                  <div className="space-y-3 animate-in fade-in duration-300">
                    <div className="flex gap-2">
                      <input 
                        type="number"
                        value={editFormData.amount}
                        onChange={(e) => setEditFormData({...editFormData, amount: e.target.value})}
                        className="w-24 bg-[var(--border-color)] p-1 rounded font-mono text-sm"
                        placeholder="Amount"
                      />
                      <select 
                        value={editFormData.currency}
                        onChange={(e) => setEditFormData({...editFormData, currency: e.target.value})}
                        className="bg-[var(--border-color)] p-1 rounded text-xs"
                      >
                        <option value="USD">USD</option>
                        <option value="ZWG">ZiG</option>
                      </select>
                      <select 
                        value={editFormData.type}
                        onChange={(e) => setEditFormData({...editFormData, type: e.target.value})}
                        className="bg-[var(--border-color)] p-1 rounded text-xs"
                      >
                        <option value="INCOME">INCOME</option>
                        <option value="EXPENSE">EXPENSE</option>
                        <option value="TRANSFER">TRANSFER</option>
                      </select>
                    </div>

                    <div className="flex gap-2">
                      <select 
                        value={editFormData.method}
                        onChange={(e) => setEditFormData({...editFormData, method: e.target.value})}
                        className="bg-[var(--border-color)] p-1 rounded text-xs flex-1"
                      >
                        <option value="CASH">CASH</option>
                        <option value="ECOCASH">ECOCASH</option>
                        <option value="INNSBUCKS">INNSBUCKS</option>
                        <option value="BANK">BANK/SWIPE</option>
                      </select>
                      <select 
                        value={editFormData.context}
                        onChange={(e) => setEditFormData({...editFormData, context: e.target.value})}
                        className="bg-[var(--border-color)] p-1 rounded text-xs flex-1"
                      >
                        <option value="PERSONAL">PERSONAL</option>
                        <option value="BUSINESS">BUSINESS</option>
                      </select>
                    </div>

                    <input 
                      type="text"
                      value={editFormData.description}
                      onChange={(e) => setEditFormData({...editFormData, description: e.target.value})}
                      className="w-full bg-[var(--border-color)] p-1 rounded text-xs"
                      placeholder="Description"
                    />

                    <div className="flex justify-end gap-2 pt-1 border-t border-[var(--border-color)]">
                      <button 
                        onClick={() => setEditingTxId(null)}
                        className="px-2 py-1 text-xs opacity-60 hover:opacity-100"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => saveManualEdit(tx.id)}
                        className="px-2 py-1 text-xs bg-[var(--color-mint)]/20 text-[var(--color-mint)] font-bold rounded"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display Mode */
                  <div className="flex justify-between items-center w-full">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider bg-[var(--border-color)]">
                          {tx.method}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider bg-[var(--border-color)] opacity-70">
                          {tx.context}
                        </span>
                        {tx.streetRate && tx.currency === "ZWG" && (
                          <span className="text-[9px] opacity-40 font-mono">
                            @ {tx.streetRate}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium opacity-90">{tx.description || "No description"}</span>
                      <span className="text-[9px] opacity-40 uppercase tracking-widest font-mono mt-1">
                        {new Date(tx.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className={`text-sm font-mono font-bold text-right`}>
                        <div className={tx.type === "INCOME" ? "text-green-500" : tx.type === "EXPENSE" ? "text-red-500" : "text-yellow-500"}>
                          {tx.type === "INCOME" ? "+" : tx.type === "EXPENSE" ? "-" : ""}{tx.amount} {tx.currency}
                        </div>
                        {tx.currency === "ZWG" && tx.streetRate && (
                          <div className="text-[9px] opacity-40 font-mono">
                            ~${(tx.amount / tx.streetRate).toFixed(2)}
                          </div>
                        )}
                      </div>

                      {/* Manual Action Buttons */}
                      <div className="flex flex-col gap-1.5 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => startEditing(tx)}
                          className="p-1 hover:bg-[var(--border-color)] rounded text-xs opacity-60 hover:opacity-100"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button 
                          onClick={() => handleDelete(tx.id)}
                          className="p-1 hover:bg-red-500/10 rounded text-xs text-red-500 opacity-60 hover:opacity-100"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}

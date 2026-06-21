"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  id: string;
  type: "user" | "bot" | "receipt-uploaded" | "ocr-done" | "error";
  text?: string;
  data?: any;
  imageUrl?: string;
  time: string;
}

function timeNow() {
  return new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function ReceiptCard({ data }: { data: any }) {
  const statusColor =
    data.status === "approved" ? "bg-green-100 border-green-200 text-green-800" :
    data.status === "flagged" ? "bg-red-100 border-red-200 text-red-800" :
    "bg-amber-100 border-amber-200 text-amber-800";

  const typeColor = data.receiptType === "buyer"
    ? "bg-purple-100 text-purple-700"
    : "bg-teal-100 text-teal-700";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 text-sm shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{data.receiptType === "buyer" ? "📥" : "📤"}</span>
          <span className={`px-2 py-0.5 rounded-md text-xs font-bold capitalize ${typeColor}`}>
            {data.receiptType}
          </span>
          <span className={`px-2 py-0.5 rounded-md text-xs font-bold capitalize ${statusColor}`}>
            {data.status}
          </span>
        </div>
        <span className="text-xs text-slate-400">{data.id}</span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-500">Merchant</span>
          <span className="font-semibold">{data.merchantName || "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Total</span>
          <span className="font-bold text-slate-900">
            {data.declaredTotal ? `Rp ${Number(data.declaredTotal).toLocaleString("id-ID")}` : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Confidence</span>
          <span>{data.confidence ? `${Math.round(data.confidence * 100)}%` : "—"}</span>
        </div>
      </div>
      {data.flags && data.flags.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          {data.flags.map((f: any, i: number) => (
            <div key={i} className="text-xs text-amber-600">
              🚩 {f.flagType?.replace(/_/g, " ")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "bot",
      text: "Halo! 👋 Kirim foto receipt untuk mencatat transaksi. Aku akan simpan dan proses otomatis.",
      time: timeNow(),
    },
  ]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [receiptType, setReceiptType] = useState<"buyer" | "supplier">("buyer");
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMsg: Message = { id: Date.now().toString(), type: "user", text, time: timeNow() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    // Bot thinking
    const botThinking: Message = { id: "thinking", type: "bot", text: "...", time: timeNow() };
    setMessages((prev) => [...prev, botThinking]);

    try {
      const res = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();

      setMessages((prev) => prev.filter((m) => m.id !== "thinking"));
      if (data.reply) {
        const botMsg: Message = { id: Date.now().toString(), type: "bot", text: data.reply, time: timeNow() };
        setMessages((prev) => [...prev, botMsg]);
      }
    } catch {
      setMessages((prev) =>
        prev.filter((m) => m.id !== "thinking").concat([{
          id: Date.now().toString(), type: "error",
          text: "Gagal mengirim. Coba lagi.", time: timeNow(),
        }])
      );
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const sendReceipt = async () => {
    if (!file) return;
    setSending(true);

    const userMsg: Message = { id: Date.now().toString(), type: "receipt-uploaded", imageUrl: preview!, time: timeNow() };
    setMessages((prev) => [...prev, userMsg]);
    setPreview(null);
    setFile(null);

    const botMsg: Message = { id: "pending", type: "bot", text: "📸 Memproses receipt...", time: timeNow() };
    setMessages((prev) => [...prev, botMsg]);

    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("receiptType", receiptType);

      const res = await fetch("/api/chat/receipt", { method: "POST", body: formData });
      const data = await res.json();

      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== "pending");
        if (data.id) {
          return [...without, {
            id: Date.now().toString(), type: "bot",
            text: `✅ Receipt #${data.id} tersimpan!\n\nTunggu sebentar — OCR sedang memproses.\n\nKamu bisa check hasilnya di dashboard.`,
            time: timeNow(),
          }];
        }
        return [...without, {
          id: Date.now().toString(), type: "error",
          text: "Gagal menyimpan receipt. Coba lagi.",
          time: timeNow(),
        }];
      });
    } catch {
      setMessages((prev) =>
        prev.filter((m) => m.id !== "pending").concat([{
          id: Date.now().toString(), type: "error",
          text: "Gagal mengirim. Coba lagi.", time: timeNow(),
        }])
      );
    } finally {
      setSending(false);
    }
  };

  const quickCommands = ["receipt", "pending", "flags", "omset", "cogs", "margin", "stok"];

  return (
    <div className="flex flex-col h-screen bg-slate-50">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-sm">HM</span>
        </div>
        <div>
          <h1 className="font-bold text-slate-900 text-sm">CV. Harapan Maju</h1>
          <p className="text-xs text-green-600">● Online</p>
        </div>
        <a
          href="/dashboard"
          className="ml-auto text-xs text-blue-600 font-semibold hover:text-blue-700"
        >
          Dashboard →
        </a>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.type === "bot" && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">HM</span>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-700 shadow-sm max-w-xs whitespace-pre-line">
                  {msg.text}
                </div>
              </div>
            )}
            {msg.type === "user" && (
              <div className="flex justify-end">
                <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm shadow-sm max-w-xs">
                  {msg.text}
                </div>
              </div>
            )}
            {msg.type === "receipt-uploaded" && (
              <div className="flex justify-end">
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm max-w-xs">
                  {msg.imageUrl && (
                    <img src={msg.imageUrl} alt="Receipt" className="w-full max-h-64 object-contain bg-slate-50" />
                  )}
                  <div className="px-3 py-2 flex items-center gap-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500">📥 {receiptType}</span>
                  </div>
                </div>
              </div>
            )}
            {msg.type === "error" && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 bg-red-500 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs">!</span>
                </div>
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl rounded-tl-sm px-4 py-3 text-sm shadow-sm">
                  {msg.text}
                </div>
              </div>
            )}
            <div className={`text-[10px] text-slate-300 mt-1 ${msg.type === "user" ? "text-right" : ""}`}>
              {msg.time}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Image preview */}
      {preview && (
        <div className="px-4 pb-2 flex-shrink-0">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm max-w-xs ml-auto">
            <img src={preview} alt="Preview" className="w-full h-40 object-contain bg-slate-50" />
            <div className="p-3">
              {/* Type selector */}
              <div className="flex gap-1.5 mb-3">
                <button
                  onClick={() => { setReceiptType("buyer"); setShowTypeMenu(false); }}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                    receiptType === "buyer"
                      ? "bg-purple-50 border-purple-300 text-purple-700"
                      : "bg-white border-slate-200 text-slate-400"
                  }`}
                >
                  📥 Beli
                </button>
                <button
                  onClick={() => { setReceiptType("supplier"); setShowTypeMenu(false); }}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                    receiptType === "supplier"
                      ? "bg-teal-50 border-teal-300 text-teal-700"
                      : "bg-white border-slate-200 text-slate-400"
                  }`}
                >
                  📤 Jual
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setPreview(null); setFile(null); }}
                  className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-200 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={sendReceipt}
                  disabled={sending}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {sending ? "Mengirim..." : "Kirim ✓"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick commands */}
      <div className="px-4 pb-1 flex-shrink-0">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {quickCommands.map((cmd) => (
            <button
              key={cmd}
              onClick={() => sendMessage(cmd)}
              className="flex-shrink-0 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-mono rounded-full hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-all"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>

      {/* Input bar */}
      <div className="px-4 pb-4 pt-1 flex-shrink-0">
        <div className="bg-white border border-slate-200 rounded-2xl flex items-center gap-2 px-3 py-2 shadow-sm">
          <button
            onClick={() => fileRef.current?.click()}
            className="w-9 h-9 bg-slate-100 hover:bg-blue-50 rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <input
            type="text"
            placeholder="Ketik perintah atau..."
            className="flex-1 text-sm outline-none text-slate-700 placeholder:text-slate-400 bg-transparent"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim()}
            className="w-9 h-9 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

    </div>
  );
}

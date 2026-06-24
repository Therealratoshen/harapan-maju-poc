"use client";

import { useEffect, useState } from "react";

function fmt(n: number) {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `Rp ${(n / 1_000).toFixed(0)}K`;
  return `Rp ${n}`;
}
function fmtFull(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}
function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type FilterType = "all" | "in" | "out";

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<any[]>([]);
  const [stock, setStock]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [typeFilter, setType]     = useState<FilterType>("all");
  const [skuFilter, setSkuFilter] = useState<string>("");
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjType, setAdjType]     = useState<"in" | "out">("out");
  const [adjSku, setAdjSku]       = useState("");
  const [adjQty, setAdjQty]       = useState("");
  const [adjPrice, setAdjPrice]   = useState("");
  const [adjNotes, setAdjNotes]   = useState("");
  const [adjCustomer, setAdjCustomer] = useState("");
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjMsg, setAdjMsg]       = useState<{ text: string; ok: boolean } | null>(null);
  const [toast, setToast]         = useState<{ text: string; ok: boolean } | null>(null);

  const showToast = (text: string, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/stock/movements").then(r => r.json()),
      fetch("/api/dashboard/stock").then(r => r.json()),
    ]).then(([movData, stockData]) => {
      setMovements(movData.movements ?? []);
      setStock(stockData.stock ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = movements.filter(m => {
    if (typeFilter !== "all" && m.movementType !== typeFilter) return false;
    if (skuFilter && m.skuId !== parseInt(skuFilter)) return false;
    return true;
  });

  const totalIn  = movements.filter(m => m.movementType === "in").reduce((s, m) => s + (m.quantity ?? 0), 0);
  const totalOut = movements.filter(m => ["out", "adjustment"].includes(m.movementType ?? "")).reduce((s, m) => s + (m.quantity ?? 0), 0);

  const doAdjust = async () => {
    if (!adjSku || !adjQty || parseFloat(adjQty) <= 0) {
      setAdjMsg({ text: "Pilih produk dan masukkan jumlah", ok: false });
      return;
    }
    setAdjSaving(true);
    setAdjMsg(null);
    try {
      const res = await fetch("/api/stock/adjustment", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skuId:       parseInt(adjSku),
          quantity:    parseFloat(adjQty),
          type:        adjType,
          unitPrice:   parseInt(adjPrice) || 0,
          notes:       adjNotes,
          customerName: adjCustomer,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setAdjMsg({ text: d.error ?? "Gagal", ok: false }); }
      else {
        showToast(`✓ ${adjType.toUpperCase()} ${adjQty} unit · Sisa: ${d.newBalance} pcs`, true);
        setAdjQty(""); setAdjPrice(""); setAdjNotes(""); setAdjCustomer("");
        setAdjSku(""); setAdjType("out"); setShowAdjust(false);
        load();
      }
    } catch { setAdjMsg({ text: "Network error", ok: false }); }
    finally { setAdjSaving(false); }
  };

  const getAdjBalance = (skuId: number) => stock.find((s: any) => s.skuId === skuId)?.balance ?? 0;

  return (
    <div style={{ padding: "28px", maxWidth: 1000 }}>
      {/* ── Toast ─────────────────────────────── */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "12px 20px", borderRadius: 10,
          background: toast.ok ? "#059669" : "#dc2626",
          color: "white", fontSize: 13, fontWeight: 500,
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          animation: "fade-in 0.2s ease-out",
        }}>{toast.text}</div>
      )}

      {/* ── Header ──────────────────────────── */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Stock Movements</h1>
            <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 400 }}>Full ledger</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Includes purchases (in) + sales/adjustments (out) from approved receipts and manual entries
          </p>
        </div>
        <button className="btn" onClick={() => setShowAdjust(true)} style={{ background: "var(--accent)", color: "#000", fontWeight: 700 }}>
          + New Adjustment
        </button>
      </div>

      {/* ── KPI strip ────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Total In (pcs)",  value: `${totalIn.toLocaleString()}`,  accent: "var(--profit)", bg: "rgba(0,255,148,0.06)" },
          { label: "Total Out (pcs)", value: `${totalOut.toLocaleString()}`, accent: "var(--danger)",  bg: "rgba(220,38,38,0.06)" },
          { label: "Net Movement",   value: `${(totalIn - totalOut).toLocaleString()}`, accent: (totalIn - totalOut) >= 0 ? "var(--profit)" : "var(--danger)", bg: "rgba(0,229,255,0.04)" },
        ].map(({ label, value, accent, bg }) => (
          <div key={label} style={{ background: bg, border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "16px 20px" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</p>
            <p style={{ fontSize: 24, fontWeight: 700, color: accent, fontFamily: "var(--font-mono)" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ──────────────────────────── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div className="tab-group">
          {(["all", "in", "out"] as FilterType[]).map(t => (
            <button key={t} onClick={() => setType(t)} className={`tab-btn ${typeFilter === t ? "active" : ""}`}>
              {t === "all" ? "All" : t === "in" ? "📥 In" : "📤 Out"}
            </button>
          ))}
        </div>
        <select value={skuFilter} onChange={e => setSkuFilter(e.target.value)} style={{ background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "6px 12px", fontSize: 13, color: "var(--text)", outline: "none", cursor: "pointer" }}>
          <option value="">All products</option>
          {stock.map((s: any) => <option key={s.skuId} value={s.skuId}>{s.skuName}</option>)}
        </select>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-secondary)", alignSelf: "center" }}>
          {filtered.length} movement{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Movements table ───────────────────── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-secondary)" }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-secondary)", fontSize: 14 }}>
          No movements yet. Record your first sale or adjustment above.
        </div>
      ) : (
        <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: 12, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 80px 100px 100px 60px", gap: 0, padding: "8px 16px", borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-alt)" }}>
            {["Date", "Product", "Type", "Qty", "Balance", "Source"].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
            ))}
          </div>
          {filtered.map((m, i) => {
            const isOut = ["out", "adjustment"].includes(m.movementType ?? "");
            return (
              <div key={m.id} style={{
                display: "grid", gridTemplateColumns: "160px 1fr 80px 100px 100px 60px",
                gap: 0, padding: "10px 16px",
                borderBottom: i < filtered.length - 1 ? "1px solid var(--border-subtle)" : "none",
                alignItems: "center",
              }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{fmtDate(m.createdAt)}</span>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{m.productName ?? "—"}</p>
                  <p style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{m.category ?? ""}</p>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: isOut ? "var(--danger)" : "var(--profit)",
                  background: isOut ? "rgba(220,38,38,0.08)" : "rgba(0,255,148,0.08)",
                  border: `1px solid ${isOut ? "rgba(220,38,38,0.2)" : "rgba(0,255,148,0.2)"}`,
                  borderRadius: 20, padding: "2px 8px", textAlign: "center",
                  textTransform: "uppercase",
                }}>
                  {m.movementType}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-mono)", color: isOut ? "var(--danger)" : "var(--profit)" }}>
                  {isOut ? "−" : "+"}{Number(m.quantity).toLocaleString()}
                </span>
                <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                  {Number(m.runningBalance).toLocaleString()} {m.unit ?? "pcs"}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: m.source === "receipt" ? "var(--accent)" : "var(--text-secondary)",
                  background: m.source === "receipt" ? "rgba(0,229,255,0.08)" : "rgba(100,116,139,0.08)",
                  border: "1px solid",
                  borderColor: m.source === "receipt" ? "rgba(0,229,255,0.2)" : "rgba(100,116,139,0.15)",
                  borderRadius: 4, padding: "2px 6px",
                }}>
                  {m.source === "receipt" ? "📋 Receipt" : "✏️ Manual"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Adjustment Modal ─────────────────── */}
      {showAdjust && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }} onClick={e => { if (e.target === e.currentTarget) setShowAdjust(false); }}>
          <div style={{
            background: "var(--surface-raised)", border: "1px solid var(--border-default)",
            borderRadius: 16, width: "100%", maxWidth: 480,
            boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
          }}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>⚡</span>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 15 }}>Stock Adjustment</p>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>Manual stock movement — not from a receipt</p>
                </div>
              </div>
              <button onClick={() => setShowAdjust(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-secondary)", padding: 4 }}>✕</button>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Type toggle */}
              <div style={{ display: "flex", gap: 8 }}>
                {(["out", "in"] as const).map(t => (
                  <button key={t} onClick={() => setAdjType(t)} style={{
                    flex: 1, padding: "10px", borderRadius: 10, border: "2px solid",
                    borderColor: adjType === t ? (t === "out" ? "var(--danger)" : "var(--profit)") : "var(--border-default)",
                    background: adjType === t ? (t === "out" ? "rgba(220,38,38,0.08)" : "rgba(0,255,148,0.08)") : "transparent",
                    color: adjType === t ? (t === "out" ? "var(--danger)" : "var(--profit)") : "var(--text-secondary)",
                    fontWeight: 700, fontSize: 14, cursor: "pointer",
                  }}>
                    {t === "out" ? "📤 OUT (sale/usage)" : "📥 IN (return/correction)"}
                  </button>
                ))}
              </div>
              {/* SKU */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Product</label>
                <select value={adjSku} onChange={e => setAdjSku(e.target.value)} style={{ width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "var(--text)", outline: "none", boxSizing: "border-box" }}>
                  <option value="">— Select —</option>
                  {stock.map((s: any) => <option key={s.skuId} value={s.skuId}>{s.skuName} · stock: {s.balance} {s.unit}</option>)}
                </select>
                {adjSku && (
                  <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>
                    Current stock: <strong style={{ color: "var(--text)" }}>{getAdjBalance(parseInt(adjSku))} {stock.find((s: any) => s.skuId === parseInt(adjSku))?.unit}</strong>
                  </p>
                )}
              </div>
              {/* Quantity */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Quantity *</label>
                  <input type="number" min="1" value={adjQty} onChange={e => setAdjQty(e.target.value)} placeholder="e.g. 3"
                    style={{ width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px", fontSize: 14, color: "var(--text)", outline: "none", boxSizing: "border-box", fontFamily: "var(--font-mono)" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Unit Price (Rp)</label>
                  <input type="number" min="0" value={adjPrice} onChange={e => setAdjPrice(e.target.value)} placeholder="0"
                    style={{ width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px", fontSize: 14, color: "var(--text)", outline: "none", boxSizing: "border-box", fontFamily: "var(--font-mono)" }} />
                </div>
              </div>
              {/* Customer */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Customer <span style={{ fontWeight: 400, textTransform: "none" }}>(optional)</span></label>
                <input value={adjCustomer} onChange={e => setAdjCustomer(e.target.value)} placeholder="e.g. Pak Budi"
                  style={{ width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "var(--text)", outline: "none", boxSizing: "border-box" }} />
              </div>
              {/* Notes */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>Notes</label>
                <input value={adjNotes} onChange={e => setAdjNotes(e.target.value)} placeholder="e.g. Penjualan eceran, retur barang"
                  style={{ width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "var(--text)", outline: "none", boxSizing: "border-box" }} />
              </div>
              {adjMsg && (
                <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: adjMsg.ok ? "rgba(0,255,148,0.08)" : "rgba(220,38,38,0.08)", color: adjMsg.ok ? "var(--profit)" : "var(--danger)", border: `1px solid ${adjMsg.ok ? "rgba(0,255,148,0.2)" : "rgba(220,38,38,0.2)"}` }}>
                  {adjMsg.text}
                </div>
              )}
            </div>
            <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAdjust(false)} style={{ background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer" }}>Cancel</button>
              <button onClick={doAdjust} disabled={adjSaving} style={{ background: adjSaving ? "var(--surface-alt)" : (adjType === "out" ? "var(--danger)" : "var(--profit)"), border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: adjSaving ? "wait" : "pointer", opacity: adjSaving ? 0.7 : 1 }}>
                {adjSaving ? "Saving…" : `⚡ Record ${adjType.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fade-in { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
}

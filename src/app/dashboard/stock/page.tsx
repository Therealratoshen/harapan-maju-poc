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

const CATEGORY_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  oil:        { bg: "rgba(217,119,6,0.1)",   text: "#b45309", dot: "#f59e0b"  },
  tire:       { bg: "rgba(100,116,139,0.1)", text: "#475569", dot: "#94a3b8" },
  brake:      { bg: "rgba(220,38,38,0.08)",  text: "#b91c1c", dot: "#ef4444" },
  coolant:     { bg: "rgba(37,99,235,0.08)",   text: "#1d4ed8", dot: "#3b82f6" },
  parts:      { bg: "rgba(139,92,246,0.08)",  text: "#6d28d9", dot: "#8b5cf6" },
  uncategorized: { bg: "var(--surface-alt)",   text: "var(--text-secondary)", dot: "#94a3b8" },
};

const CATEGORY_ICONS: Record<string, string> = {
  oil: "🛢️", tire: "🔘", brake: "🛑", coolant: "💧", parts: "🔩", uncategorized: "📦"
};

export default function StockPage() {
  const [data, setData]           = useState<any>({ stock: [], unreconciledCount: 0, currentValue: 0 });
  const [loading, setLoading]     = useState(true);
  const [activeCategory, setCat]  = useState<string>("all");
  const [search, setSearch]       = useState("");

  useEffect(() => {
    fetch("/api/dashboard/stock")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const { stock = [], unreconciledCount = 0, currentValue = 0 } = data;

  const filtered = activeCategory === "all"
    ? stock
    : stock.filter((s: any) => s.category === activeCategory);

  const searched = search
    ? filtered.filter((s: any) =>
        (s.skuName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (s.partNumber ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : filtered;

  const categories: string[] = ["all", ...new Set<string>(stock.map((s: any) => String(s.category ?? "uncategorized")))];

  const totalStockIn    = stock.reduce((s: number, item: any) => s + item.stockIn,    0);
  const totalStockOut   = stock.reduce((s: number, item: any) => s + item.stockOut,   0);
  const totalBalance    = stock.reduce((s: number, item: any) => s + item.balance,    0);
  const lowStockCount   = stock.filter((s: any) => s.balance > 0 && s.balance <= 3).length;
  const deadStockCount  = stock.filter((s: any) => {
    // rough: items with balance > 0 but no recent stock movement — simplified flag
    return s.balance > 0 && s.stockIn > 0 && s.stockOut === 0;
  }).length;

  return (
    <div style={{ padding: "28px", maxWidth: 1000 }}>
      {/* ── Header ─────────────────────────────────── */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>Stock Position</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Based on approved buyer receipts — reconciliation with supplier receipts pending
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => {
          const csv = [
            ["SKU","Part Number","Category","Stock In","Stock Out","Balance"].join(","),
            ...stock.map((s: any) => [s.skuName, s.partNumber ?? "", s.category ?? "", s.stockIn, s.stockOut, s.balance].join(","))
          ].join("\n");
          const blob = new Blob([csv], { type: "text/csv" });
          const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
          a.download = "stock-report.csv"; a.click();
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export CSV
        </button>
      </div>

      {/* ── KPI Strip ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14, marginBottom: 20 }}>
        {[
          { label: "SKUs",          value: stock.length, accent: "neutral" },
          { label: "Stock In",      value: `${totalStockIn.toLocaleString()} pcs`, accent: "revenue" },
          { label: "Stock Out",     value: `${totalStockOut.toLocaleString()} pcs`, accent: "cogs" },
          { label: "Current Balance", value: `${totalBalance.toLocaleString()} pcs`, accent: totalBalance > 0 ? "profit" : "neutral" },
          { label: "Current Value",  value: fmt(currentValue), accent: "accent" },
        ].map(({ label, value, accent }, i) => (
          <div key={i} className={`metric-card border-${accent}`}>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-secondary)", marginBottom: 8 }}>
              {label}
            </p>
            <p style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", lineHeight: 1 }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Alerts ────────────────────────────────── */}
      {(unreconciledCount > 0 || lowStockCount > 0 || deadStockCount > 0) && (
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          {unreconciledCount > 0 && (
            <div style={{ flex: 1, minWidth: 200, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <p style={{ fontSize: 12, color: "#92400e" }}>
                <strong>{unreconciledCount}</strong> unreconciled line item{unreconciledCount !== 1 ? "s" : ""}
              </p>
            </div>
          )}
          {lowStockCount > 0 && (
            <div style={{ flex: 1, minWidth: 200, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p style={{ fontSize: 12, color: "#92400e" }}>
                <strong>{lowStockCount}</strong> low-stock SKU{lowStockCount !== 1 ? "s" : ""} (≤3 pcs)
              </p>
            </div>
          )}
          {deadStockCount > 0 && (
            <div style={{ flex: 1, minWidth: 200, background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.2)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p style={{ fontSize: 12, color: "#475569" }}>
                <strong>{deadStockCount}</strong> dead-stock SKU{deadStockCount !== 1 ? "s" : ""} (unsold)
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Filters ───────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {/* Category tabs */}
        <div className="tab-group">
          {categories.map(cat => (
            <button key={cat} onClick={() => setCat(cat)} className={`tab-btn ${activeCategory === cat ? "active" : ""}`}>
              {CATEGORY_ICONS[cat] ?? "📦"} {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
              {cat !== "all" && (
                <span className="count">{stock.filter((s: any) => s.category === cat).length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search SKU or part number..."
          className="input"
          style={{ maxWidth: 220 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Stock List ────────────────────────────── */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />)}
        </div>
      ) : searched.length === 0 ? (
        <div className="card-flat" style={{ textAlign: "center", padding: "60px 20px" }}>
          <p style={{ fontWeight: 500, marginBottom: 4 }}>No stock data</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Approved buyer receipts will populate this list.</p>
          <a href="/dashboard/upload" className="btn btn-primary" style={{ marginTop: 16 }}>Upload Receipt</a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 120px", gap: 12, padding: "8px 16px", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
            <span>SKU</span>
            <span style={{ textAlign: "right" }}>In</span>
            <span style={{ textAlign: "right" }}>Out</span>
            <span style={{ textAlign: "right" }}>Balance</span>
            <span>Stock Level</span>
          </div>

          {searched.map((s: any) => {
            const cat      = s.category ?? "uncategorized";
            const colors   = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.uncategorized;
            const pct      = s.stockIn > 0 ? Math.min((s.balance / s.stockIn) * 100, 100) : 0;
            const isDead   = s.balance > 0 && s.stockIn > 0 && s.stockOut === 0;
            const isLow    = s.balance > 0 && s.balance <= 3;
            const barColor = isDead ? "var(--danger)" : isLow ? "var(--warning)" : "var(--profit)";

            return (
              <div key={s.skuId ?? s.id}
                className="card-flat"
                style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: "1fr 90px 90px 90px 120px", gap: 12, alignItems: "center" }}>
                {/* SKU info */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14 }}>{CATEGORY_ICONS[cat] ?? "📦"}</span>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{s.skuName}</p>
                      {s.partNumber && (
                        <p style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{s.partNumber}</p>
                      )}
                    </div>
                    {isDead && (
                      <span className="flag-badge" style={{ background: "rgba(220,38,38,0.08)", color: "var(--danger)" }}>Dead stock</span>
                    )}
                    {isLow && !isDead && (
                      <span className="flag-badge" style={{ background: "rgba(217,119,6,0.08)", color: "var(--warning)" }}>Low stock</span>
                    )}
                  </div>
                </div>

                {/* Stock in */}
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>In</p>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--revenue)" }}>{s.stockIn.toLocaleString()}</p>
                </div>

                {/* Stock out */}
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>Out</p>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{s.stockOut.toLocaleString()}</p>
                </div>

                {/* Balance */}
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>Balance</p>
                  <p style={{ fontSize: 14, fontWeight: 700, color: s.balance > 0 ? "var(--profit)" : "var(--text-secondary)" }}>
                    {s.balance.toLocaleString()}
                  </p>
                </div>

                {/* Stock bar */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{pct.toFixed(0)}% remaining</span>
                  </div>
                  <div className="stock-bar">
                    <div
                      className="stock-bar-fill"
                      style={{ width: `${pct}%`, background: barColor }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 16 }}>
        * Stock balance is based on approved buyer receipts. Negative balance indicates items sold before recorded purchase.
      </p>
    </div>
  );
}

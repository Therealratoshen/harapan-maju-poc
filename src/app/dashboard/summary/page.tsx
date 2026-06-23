"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  BarChart as RechartsBarChart,
} from "recharts";
import MetricCard from "../../../components/MetricCard";

function fmt(n: number) {
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `Rp ${(n / 1_000).toFixed(0)}K`;
  return `Rp ${n}`;
}

function fmtFull(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 15) return "Good afternoon";
  return "Good evening";
}

function formatDateLong() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

function SkeletonKPI() {
  return (
    <div className="kpi-grid-6" style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 14 }}>
      {[1,2,3,4,5].map(i => (
        <div key={i} className="card-flat" style={{ height: 96 }}>
          <div className="skeleton" style={{ height: 10, width: "60%", marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 28, width: "80%", marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 10, width: "50%" }} />
        </div>
      ))}
    </div>
  );
}

export default function SummaryPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/summary")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "28px 28px 0" }}>
        <SkeletonKPI />
      </div>
    );
  }

  const {
    summary = {},
    monthly = [],
    recentReceipts = [],
    flagSummary = [],
    cogsBySupplier = [],
    topMerchants = [],
    reconciliationAlerts = [],
    greeting = getGreeting(),
    pendingCount = 0,
  } = data ?? {};

  const donutData = [
    { name: "Revenue", value: summary.revenue ?? 0, color: "var(--revenue)" },
    { name: "COGS",    value: summary.cogs    ?? 0, color: "#94a3b8" },
  ].filter(d => d.value > 0);

  const totalDonut = donutData.reduce((s, d) => s + d.value, 0);
  const marginPct = summary.grossMargin ?? 0;
  const marginAccent = marginPct >= 20 ? "profit" : marginPct >= 10 ? "warning" : "danger";

  return (
    <div style={{ padding: "28px 28px 0", maxWidth: 1200 }}>

      {/* ── Header ─────────────────────────────────── */}
      <div style={{ marginBottom: 24, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: 4 }}>
            {greeting}, Owner
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{formatDateLong()}</p>
        </div>
        <Link href="/dashboard/upload" className="btn btn-primary">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
          Upload Receipt
        </Link>
      </div>

      {/* ── Pending / Needs Review Alert ─────────────── */}
      {pendingCount > 0 && (
        <div style={{
          background: "rgba(217,119,6,0.08)",
          border: "1px solid rgba(217,119,6,0.2)",
          borderRadius: 12, padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, marginBottom: 12, flexWrap: "wrap"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, background: "rgba(217,119,6,0.15)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#92400e" }}>{pendingCount} receipt{pendingCount !== 1 ? "s" : ""} awaiting review</p>
              <p style={{ fontSize: 12, color: "#b45309", marginTop: 1 }}>Photos from Telegram — run OCR or approve manually</p>
            </div>
          </div>
          <Link href="/dashboard/receipts" className="btn btn-sm" style={{ background: "#d97706", color: "white", flexShrink: 0 }}>
            Review Now →
          </Link>
        </div>
      )}

      {/* ── Reconciliation Alerts ────────────────────── */}
      {reconciliationAlerts.length > 0 && (
        <div style={{
          background: "rgba(220,38,38,0.06)",
          border: "1px solid rgba(220,38,38,0.2)",
          borderRadius: 12, padding: "14px 18px",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          gap: 12, marginBottom: 20, flexWrap: "wrap"
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1 }}>
            <div style={{ width: 36, height: 36, background: "rgba(220,38,38,0.12)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#991b1b", marginBottom: 6 }}>
                ⚠️ {reconciliationAlerts.length} receipt{reconciliationAlerts.length !== 1 ? "s" : ""} with unresolved amount mismatch
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {reconciliationAlerts.map((a: any) => (
                  <div key={a.receiptId} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <Link href="/dashboard/receipts" style={{ fontSize: 12, fontWeight: 600, color: "#dc2626", textDecoration: "none", minWidth: 120 }}>
                      #{a.receiptId} {a.merchantName}
                    </Link>
                    <span className={`badge badge-${a.status}`} style={{ fontSize: 10 }}>{a.status}</span>
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      Declared <strong style={{ color: "var(--text)" }}>{fmtFull(a.declaredTotal)}</strong> vs
                      Computed <strong style={{ color: "var(--text)" }}>{fmtFull(a.computedTotal)}</strong>
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", background: "rgba(220,38,38,0.08)", padding: "2px 6px", borderRadius: 4 }}>
                      Δ {a.variancePct}% mismatch
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>[{a.flagType.replace(/_/g, " ")}]</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <Link href="/dashboard/receipts" className="btn btn-sm" style={{ background: "#dc2626", color: "white", flexShrink: 0, marginTop: 4 }}>
            Fix Now →
          </Link>
        </div>
      )}

      {/* ── KPI Cards ───────────────────────────────── */}
      <div className="kpi-grid-6" style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 14, marginBottom: 20 }}>
        <MetricCard
          label="Revenue"
          value={fmt(summary.revenue ?? 0)}
          sublabel={`${summary.supplierReceipts ?? 0} supplier receipts`}
          accent="revenue"
        />
        <MetricCard
          label="COGS"
          value={fmt(summary.cogs ?? 0)}
          sublabel={`${summary.buyerReceipts ?? 0} buyer receipts`}
          accent="cogs"
        />
        <MetricCard
          label="Gross Profit"
          value={fmt(summary.grossProfit ?? 0)}
          sublabel={`${marginPct.toFixed(1)}% margin`}
          accent={marginPct >= 0 ? "profit" : "danger"}
        />
        <MetricCard
          label="Line Items"
          value={summary.lineItemCount ?? 0}
          sublabel="total extracted"
          accent="accent"
        />
        <MetricCard
          label="Margin Rate"
          value={`${marginPct.toFixed(1)}%`}
          sublabel="Revenue vs COGS"
          accent={marginAccent}
        />
        <MetricCard
          label="Pending"
          value={summary.pendingReceipts ?? 0}
          sublabel="awaiting review"
          accent="warning"
          pulse={(summary.pendingReceipts ?? 0) > 0}
        />
      </div>

      {/* ── Charts Row ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Monthly bar chart */}
        <div className="card-flat">
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>Revenue &amp; COGS — Monthly</p>
          {monthly.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <RechartsBarChart data={monthly} barGap={4} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} />
                <YAxis tickFormatter={fmt} tick={{ fontSize: 10, fill: "var(--text-secondary)" }} width={56} />
                <Tooltip
                  formatter={(v: any) => [fmtFull(Number(v)), ""]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)" }}
                />
                <Bar dataKey="revenue" name="Revenue" fill="var(--revenue)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cogs"    name="COGS"    fill="#cbd5e1"    radius={[4, 4, 0, 0]} />
              </RechartsBarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: 13 }}>
              No monthly data yet — upload receipts to see trends
            </div>
          )}
          <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--revenue)", display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>Revenue</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#cbd5e1", display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>COGS</span>
            </div>
          </div>
        </div>

        {/* COGS by Supplier */}
        <div className="card-flat">
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 16 }}>COGS by Supplier</p>
          {cogsBySupplier.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {cogsBySupplier.slice(0, 6).map((s: any, i: number) => {
                const maxVal = cogsBySupplier[0]?.total ?? 1;
                const pct = Math.min((s.total / maxVal) * 100, 100);
                return (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{s.supplier}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{fmt(s.total)}</span>
                    </div>
                    <div style={{ height: 6, background: "var(--surface-alt)", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: i === 0 ? "var(--revenue)" : "#94a3b8", borderRadius: 10, transition: "width 0.4s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>No supplier data yet</div>
          )}
        </div>
      </div>

      {/* ── Bottom Row ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Recent Receipts */}
        <div className="card-flat" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Recent Receipts</p>
            <Link href="/dashboard/receipts" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500, textDecoration: "none" }}>
              View all →
            </Link>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--surface-alt)" }}>
                  {["Merchant", "Type", "Date", "Total", "Status"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentReceipts.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "32px 16px", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>No receipts yet — upload one to get started</td></tr>
                )}
                {recentReceipts.map((r: any) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <p style={{ fontWeight: 500, color: "var(--text)" }}>{r.merchantName ?? r.customerName ?? "—"}</p>
                      <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 1, fontFamily: "var(--font-mono)" }}>{r.invoiceNumber ?? "—"}</p>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span className={`badge badge-${r.receiptType === "buyer" ? "buyer" : "supplier"}`}>{r.receiptType}</span>
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--text-secondary)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {r.receiptDate ? new Date(r.receiptDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                      {r.currency !== "IDR" ? `${r.declaredTotal} ${r.currency}` : fmtFull(r.declaredTotal ?? 0)}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span className={`badge badge-${r.status}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Merchants (Revenue) */}
        <div className="card-flat">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Top Merchants</p>
            <Link href="/dashboard/receipts" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500, textDecoration: "none" }}>Details →</Link>
          </div>
          {topMerchants.length === 0 ? (
            <div style={{ color: "var(--text-secondary)", fontSize: 12, padding: "8px 0" }}>No merchant data yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {topMerchants.map((m: any, i: number) => {
                const maxVal = topMerchants[0]?.totalValue ?? 1;
                const pct = Math.min((m.totalValue / maxVal) * 100, 100);
                return (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                        <span style={{ color: i === 0 ? "var(--accent)" : "var(--text-secondary)", marginRight: 4 }}>#{i + 1}</span>
                        {m.merchantName}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--revenue)" }}>{fmt(m.totalValue)}</span>
                    </div>
                    <div style={{ height: 5, background: "var(--surface-alt)", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: i === 0 ? "var(--revenue)" : i === 1 ? "var(--accent)" : "#94a3b8", borderRadius: 10 }} />
                    </div>
                    <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 2 }}>{m.receiptCount} receipt{m.receiptCount !== 1 ? "s" : ""}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Flags + Quick Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Flags summary */}
          <div className="card-flat">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Flags</p>
              <Link href="/dashboard/flags" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500, textDecoration: "none" }}>View all →</Link>
            </div>
            {flagSummary.length === 0 ? (
              <div style={{ textAlign: "center", padding: "16px 0", color: "var(--profit)", fontSize: 13, fontWeight: 500 }}>
                ✅ No active flags
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {flagSummary.map((f: any) => (
                  <div key={f.flagType} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", borderRadius: 8,
                    background: f.flagType === "MATH_ERROR" || f.flagType === "NEGATIVE_STOCK" ? "rgba(220,38,38,0.06)" :
                               f.flagType === "DUPLICATE" ? "rgba(220,38,38,0.06)" : "rgba(217,119,6,0.06)",
                    border: `1px solid ${f.flagType === "MATH_ERROR" || f.flagType === "NEGATIVE_STOCK" || f.flagType === "DUPLICATE" ? "rgba(220,38,38,0.15)" : "rgba(217,119,6,0.15)"}`,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: f.flagType === "MATH_ERROR" || f.flagType === "NEGATIVE_STOCK" || f.flagType === "DUPLICATE" ? "var(--danger)" : "var(--warning)" }}>
                      {f.flagType.replace(/_/g, " ")}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{f.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="card-flat">
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>Quick Actions</p>
            {[
              { href: "/dashboard/stock",   label: "Stock Position",   icon: "📦" },
              { href: "/dashboard/upload",   label: "Upload Receipt",   icon: "⬆️" },
              { href: "/dashboard/receipts", label: "All Receipts",     icon: "🧾" },
            ].map(({ href, label, icon }) => (
              <Link key={href} href={href} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 8, textDecoration: "none", color: "var(--text)",
                border: "1px solid var(--border)", marginBottom: 6, fontSize: 13, fontWeight: 500,
                transition: "all 0.15s",
              }} className="quick-action-link">
                <span>{icon}</span>{label}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" style={{ marginLeft: "auto" }}><polyline points="9 18 15 12 9 6"/></svg>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 24 }}>
        * Dashboard shows approved IDR receipts only. Pending & flagged receipts excluded from totals.
      </p>

      <style>{`
        .quick-action-link:hover { background: var(--accent-bg) !important; border-color: var(--accent-border) !important; color: var(--accent) !important; }
        .quick-action-link:hover svg { stroke: var(--accent) !important; }
        @media (max-width: 1280px) {
          .kpi-grid-6 { grid-template-columns: repeat(3,1fr) !important; }
        }
        @media (max-width: 768px) {
          .kpi-grid-6 { grid-template-columns: repeat(2,1fr) !important; }
        }
      `}</style>
    </div>
  );
}

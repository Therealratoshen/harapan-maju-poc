"use client";

import { useEffect, useState } from "react";

function formatDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function getSeverity(flagType: string): "critical" | "warning" | "info" {
  if (["MATH_ERROR","NEGATIVE_STOCK","DUPLICATE"].includes(flagType)) return "critical";
  if (["MISSING_INVOICE_NO","LOW_CONFIDENCE","FOREIGN_CURRENCY"].includes(flagType)) return "warning";
  return "info";
}

function getSeverityLabel(severity: string) {
  if (severity === "critical") return "CRITICAL";
  if (severity === "warning")  return "WARNING";
  return "INFO";
}

function getActionLabel(flagType: string): string {
  const map: Record<string, string> = {
    MATH_ERROR:         "Review Receipt",
    MISSING_INVOICE_NO: "Add Invoice #",
    DUPLICATE:          "View Original",
    NEGATIVE_STOCK:     "Review Stock",
    LOW_CONFIDENCE:     "Review Receipt",
    FOREIGN_CURRENCY:   "View Receipt",
    DEAD_STOCK:         "Review Item",
    UNRECONCILED:       "View Stock",
  };
  return map[flagType] ?? "Review";
}

function getActionHref(flag: any): string {
  if (["MATH_ERROR","MISSING_INVOICE_NO","DUPLICATE","LOW_CONFIDENCE","FOREIGN_CURRENCY"].includes(flag.flagType)) {
    return "/dashboard/receipts";
  }
  return "/dashboard/stock";
}

export default function FlagsPage() {
  const [data, setData]          = useState<any>({ flags: [], flagCounts: [] });
  const [loading, setLoading]    = useState(true);
  const [showResolved, setShow]  = useState(false);
  const [showInvoiceInput, setShowInvoiceInput] = useState<number | null>(null);
  const [invoiceValue, setInvoiceValue] = useState("");
  const [toast, setToast]        = useState<{ msg: string; type: string } | null>(null);
  const [dismissing, setDismissing] = useState<number | null>(null);

  const load = () => {
    fetch("/api/dashboard/flags")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string, tp = "success") => {
    setToast({ msg, type: tp });
    setTimeout(() => setToast(null), 4000);
  };

  const resolveFlag = async (flagId: number, action = "review") => {
    setDismissing(flagId);
    try {
      const body: any = { flagId, action };
      if (action === "add_invoice" && invoiceValue) {
        body.data = { invoiceNumber: invoiceValue };
      }
      await fetch("/api/dashboard/flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      showToast("Flag marked as reviewed ✅");
      setShowInvoiceInput(null);
      setInvoiceValue("");
      load();
    } catch {
      showToast("Failed to update flag", "error");
    } finally {
      setDismissing(null);
    }
  };

  const { flags = [], flagCounts = [] } = data;

  const unresolvedFlags = flags.filter((f: any) => !f.resolved);
  const resolvedFlags   = flags.filter((f: any) =>  f.resolved);

  const critical = unresolvedFlags.filter((f: any) => getSeverity(f.flagType) === "critical");
  const warnings = unresolvedFlags.filter((f: any) => getSeverity(f.flagType) === "warning");
  const infos    = unresolvedFlags.filter((f: any) => getSeverity(f.flagType) === "info");
  const shownFlags = showResolved ? flags : unresolvedFlags;

  const totalUnresolved = unresolvedFlags.length;
  const totalCritical   = critical.length;
  const totalWarning    = warnings.length;

  return (
    <div style={{ padding: "28px", maxWidth: 900 }}>
      {/* ── Toast ───────────────────────────────────── */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "12px 20px", borderRadius: 10,
          background: toast.type === "success" ? "#059669" : "#dc2626",
          color: "white", fontSize: 13, fontWeight: 500,
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
          animation: "fade-in 0.2s ease-out",
        }}>
          {toast.msg}
        </div>
      )}

      {/* ── Header ─────────────────────────────────── */}
      <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>Flags &amp; Alerts</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {totalUnresolved} active alert{totalUnresolved !== 1 ? "s" : ""} —
            {totalCritical > 0 && <span style={{ color: "var(--danger)", fontWeight: 600 }}> {totalCritical} critical</span>}
            {totalWarning  > 0 && <span style={{ color: "var(--warning)" }}>, {totalWarning} warnings</span>}
          </p>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={showResolved} onChange={e => setShow(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
          Show resolved
        </label>
      </div>

      {/* ── Summary chips ───────────────────────────── */}
      {!loading && flagCounts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
          {flagCounts.map((fc: any) => {
            const sev = getSeverity(fc.flagType);
            const colors = sev === "critical" ? { bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.2)", text: "var(--danger)" }
                            : sev === "warning"  ? { bg: "rgba(217,119,6,0.08)",  border: "rgba(217,119,6,0.2)", text: "var(--warning)" }
                            :                         { bg: "rgba(8,145,178,0.08)",   border: "rgba(8,145,178,0.2)",  text: "var(--accent)" };
            return (
              <div key={fc.flagType} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 20, fontSize: 12,
                background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: colors.text, display: "inline-block" }} />
                {fc.flagType.replace(/_/g, " ")}: <strong>{fc.unresolved ?? fc.count}</strong>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Content ────────────────────────────────── */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 88, borderRadius: 12 }} />)}
        </div>
      ) : shownFlags.length === 0 ? (
        <div className="card-flat" style={{ textAlign: "center", padding: "60px 20px" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="1.5" style={{ margin: "0 auto 16px", display: "block" }}>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <p style={{ fontSize: 16, fontWeight: 600, color: "var(--profit)", marginBottom: 6 }}>No active flags</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>All receipts are clean — no discrepancies detected.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* CRITICAL */}
          {critical.length > 0 && (
            <FlagGroup
              title="Critical"
              severity="critical"
              flags={showResolved ? critical : showResolved ? [] : critical}
              allFlags={critical}
              showResolved={showResolved}
              onResolve={resolveFlag}
              dismissing={dismissing}
              showInvoiceInput={showInvoiceInput}
              setShowInvoiceInput={setShowInvoiceInput}
              invoiceValue={invoiceValue}
              setInvoiceValue={setInvoiceValue}
            />
          )}

          {/* WARNINGS */}
          {warnings.length > 0 && (
            <FlagGroup
              title="Warnings"
              severity="warning"
              flags={warnings}
              allFlags={warnings}
              showResolved={showResolved}
              onResolve={resolveFlag}
              dismissing={dismissing}
              showInvoiceInput={showInvoiceInput}
              setShowInvoiceInput={setShowInvoiceInput}
              invoiceValue={invoiceValue}
              setInvoiceValue={setInvoiceValue}
            />
          )}

          {/* INFO */}
          {infos.length > 0 && (
            <FlagGroup
              title="Informational"
              severity="info"
              flags={infos}
              allFlags={infos}
              showResolved={showResolved}
              onResolve={resolveFlag}
              dismissing={dismissing}
              showInvoiceInput={showInvoiceInput}
              setShowInvoiceInput={setShowInvoiceInput}
              invoiceValue={invoiceValue}
              setInvoiceValue={setInvoiceValue}
            />
          )}

          {/* RESOLVED */}
          {showResolved && resolvedFlags.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--cogs)", display: "inline-block" }} />
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--cogs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Resolved ({resolvedFlags.length})
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {resolvedFlags.map((f: any) => (
                  <div key={f.id} className="flag-card severity-info resolved" style={{ opacity: 0.5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span className="flag-badge resolved">Resolved</span>
                      <span className="flag-badge" style={{ background: "rgba(100,116,139,0.1)", color: "var(--cogs)" }}>
                        {f.flagType.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{f.message}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      Receipt #{f.receiptId} · {formatDate(f.receiptDate)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes fade-in { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
}

// ── Sub-component ────────────────────────────────────────────────
interface FlagGroupProps {
  title: string;
  severity: "critical" | "warning" | "info";
  flags: any[];
  allFlags: any[];
  showResolved: boolean;
  onResolve: (id: number, action?: string) => void;
  dismissing: number | null;
  showInvoiceInput: number | null;
  setShowInvoiceInput: (id: number | null) => void;
  invoiceValue: string;
  setInvoiceValue: (v: string) => void;
}

function FlagGroup({
  title, severity, flags,
  showResolved,
  onResolve, dismissing,
  showInvoiceInput, setShowInvoiceInput,
  invoiceValue, setInvoiceValue,
}: FlagGroupProps) {
  const sevColor = severity === "critical" ? "var(--danger)" : severity === "warning" ? "var(--warning)" : "var(--accent)";
  const sevBg    = severity === "critical" ? "rgba(220,38,38,0.06)" : severity === "warning" ? "rgba(217,119,6,0.06)" : "rgba(8,145,178,0.06)";
  const sevBorder= severity === "critical" ? "rgba(220,38,38,0.2)" : severity === "warning" ? "rgba(217,119,6,0.2)" : "rgba(8,145,178,0.2)";
  const sevIcon  = severity === "critical" ? "🔴" : severity === "warning" ? "🟡" : "🔵";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12 }}>{sevIcon}</span>
        <p style={{ fontSize: 12, fontWeight: 600, color: sevColor, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {title} ({flags.length})
        </p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {flags.map(flag => (
          <div key={flag.id} className={`flag-card severity-${severity}`}
            style={{ borderLeft: `3px solid ${sevColor}`, background: sevBg, borderColor: sevBorder }}>
            {/* Flag header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span className="flag-badge" style={{ background: sevBorder, color: sevColor }}>
                    {flag.flagType.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    Receipt #{flag.receiptId} · {formatDate(flag.receiptDate)}
                  </span>
                  {flag.receiptType && (
                    <span style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "capitalize" }}>
                      · {flag.receiptType}
                    </span>
                  )}
                  {flag.merchantName && (
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>· {flag.merchantName}</span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5 }}>{flag.message}</p>
                {/* Detail line for specific flag types */}
                {flag.flagType === "MATH_ERROR" && flag.receiptId && (
                  <p style={{ fontSize: 12, color: sevColor, fontWeight: 500, marginTop: 4 }}>
                    Declared total differs from computed — check line items
                  </p>
                )}
              </div>

              {/* Action buttons */}
              {showInvoiceInput === flag.id ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
                  <input
                    className="input"
                    placeholder="Invoice number"
                    value={invoiceValue}
                    onChange={e => setInvoiceValue(e.target.value)}
                    style={{ fontSize: 12 }}
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => setShowInvoiceInput(null)}>Cancel</button>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={dismissing === flag.id}
                      onClick={() => onResolve(flag.id, "add_invoice")}
                    >
                      {dismissing === flag.id ? "..." : "Save & Review"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                  <a
                    href={getActionHref(flag)}
                    className="btn btn-sm btn-outline"
                    style={{ borderColor: sevBorder, color: sevColor }}
                  >
                    {getActionLabel(flag.flagType)} →
                  </a>
                  {flag.flagType === "MISSING_INVOICE_NO" && (
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => setShowInvoiceInput(flag.id)}
                    >
                      + Add Invoice #
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={dismissing === flag.id}
                    onClick={() => onResolve(flag.id, "review")}
                  >
                    {dismissing === flag.id ? "..." : "✓ Mark Reviewed"}
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ background: "var(--surface-alt)", color: "var(--text-secondary)" }}
                    onClick={() => onResolve(flag.id, "dismiss")}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

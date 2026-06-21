"use client";

import { useEffect, useState, useCallback } from "react";

function formatRupiah(n: number) {
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `Rp ${(n / 1_000).toFixed(0)}K`;
  return `Rp ${n}`;
}
function fmtFull(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}
function formatDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

type Status = "all" | "pending" | "flagged" | "approved" | "rejected";
type Type   = "all" | "buyer"   | "supplier";

export default function ReceiptsPage() {
  const [receipts, setReceipts]     = useState<any[]>([]);
  const [loading,  setLoading]     = useState(true);
  const [status,   setStatus]     = useState<Status>("all");
  const [type,     setType]       = useState<Type>("all");
  const [search,   setSearch]     = useState("");
  const [actioning, setActioning]  = useState<number | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);
  const [toast,     setToast]      = useState<{ msg: string; type: string } | null>(null);
  const [rejectId,   setRejectId]   = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (type    !== "all") params.set("type",    type);
    if (search)             params.set("search",   search);

    setLoading(true);
    fetch(`/api/receipts?${params}`)
      .then(r => r.json())
      .then(d => { setReceipts(d.receipts ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [status, type, search]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string, tp = "success") => {
    setToast({ msg, type: tp });
    setTimeout(() => setToast(null), 4000);
  };

  const handleAction = async (id: number, action: "approve" | "reject", note?: string) => {
    setActioning(id);
    try {
      const res = await fetch(`/api/receipts/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const d = await res.json();
      if (d.success) {
        showToast(`Receipt ${action === "approve" ? "approved ✅" : "rejected ❌"}`);
        load();
      } else {
        showToast(d.error ?? "Action failed", "error");
      }
    } catch {
      showToast("Network error — try again", "error");
    } finally {
      setActioning(null);
      setRejectId(null);
    }
  };

  const handleProcess = async (id: number) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/receipts/${id}/process`, { method: "POST" });
      if (res.ok) {
        showToast("OCR complete ✅");
        load();
      } else {
        const err = await res.json();
        showToast(`OCR failed: ${err.error ?? "check MINIMAX_API_KEY"}`, "error");
      }
    } catch {
      showToast("OCR failed — network error", "error");
    } finally {
      setProcessing(null);
    }
  };

  const counts = {
    all:      receipts.length,
    pending:  receipts.filter(r => r.status === "pending").length,
    flagged:  receipts.filter(r => r.status === "flagged").length,
    approved: receipts.filter(r => r.status === "approved").length,
    rejected: receipts.filter(r => r.status === "rejected").length,
  };

  const filtered = search
    ? receipts.filter(r => {
        const q = search.toLowerCase();
        return [r.merchantName, r.customerName, r.invoiceNumber].some(v =>
          (v ?? "").toLowerCase().includes(q)
        );
      })
    : receipts;

  const pendingGroup    = filtered.filter(r => r.status === "pending"  || r.status === "flagged");
  const approvedGroup   = filtered.filter(r => r.status === "approved");
  const otherGroup      = filtered.filter(r => r.status === "rejected");

  return (
    <div style={{ padding: "28px", maxWidth: 1100 }}>
      {/* ── Toast ───────────────────────────────────── */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          padding: "12px 20px", borderRadius: 10,
          background: toast.type === "success" ? "#059669" : toast.type === "error" ? "#dc2626" : "var(--accent)",
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
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>Receipts</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {receipts.length} total · {counts.pending + counts.flagged} pending review
          </p>
        </div>
        <a href="/dashboard/upload" className="btn btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
          Upload Receipt
        </a>
      </div>

      {/* ── Filters ────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {/* Status tabs */}
        <div className="tab-group">
          {(["all","pending","flagged","approved","rejected"] as Status[]).map(s => (
            <button key={s} onClick={() => setStatus(s)} className={`tab-btn ${status === s ? "active" : ""}`}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
              {counts[s] > 0 && <span className="count">{counts[s]}</span>}
            </button>
          ))}
        </div>

        {/* Type tabs */}
        <div className="tab-group">
          {(["all","buyer","supplier"] as Type[]).map(t => (
            <button key={t} onClick={() => setType(t)} className={`tab-btn ${type === t ? "active" : ""}`}>
              {t === "all" ? "All types" : t === "buyer" ? "📥 Buyer" : "📤 Supplier"}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search merchant, invoice..."
          className="input"
          style={{ maxWidth: 240 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Content ───────────────────────────────── */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-flat" style={{ textAlign: "center", padding: "60px 20px", color: "var(--text-secondary)" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: "0 auto 12px", display: "block", opacity: 0.4 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          <p style={{ fontWeight: 500 }}>No receipts found</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>{search ? "Try clearing the search" : "Upload your first receipt to get started"}</p>
          {!search && <a href="/dashboard/upload" className="btn btn-primary" style={{ marginTop: 16 }}>Upload Receipt</a>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* PENDING / FLAGGED */}
          {pendingGroup.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warning)", display: "inline-block" }} />
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--warning)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Needs Review ({pendingGroup.length})
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pendingGroup.map(r => (
                  <div key={r.id} className={`receipt-card status-${r.status}`} style={{ padding: "16px 20px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                      {/* Left info */}
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 16 }}>
                            {r.receiptType === "buyer" ? "📥" : "📤"}
                          </span>
                          <p style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
                            {r.merchantName ?? r.customerName ?? "—"}
                          </p>
                          <span className={`badge badge-${r.receiptType}`}>{r.receiptType}</span>
                          <span className={`badge badge-${r.status}`}>{r.status}</span>
                        </div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                            {r.invoiceNumber ? `#${r.invoiceNumber}` : "No invoice #"}
                          </span>
                          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            {formatDate(r.receiptDate)}
                          </span>
                          {r.customerName && r.merchantName !== r.customerName && (
                            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>→ {r.customerName}</span>
                          )}
                          {r.currency !== "IDR" && (
                            <span style={{ fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>{r.currency}</span>
                          )}
                        </div>
                        {r.lineItems?.length > 0 && (
                          <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
                            {r.lineItems.length} line items · Confidence: {Math.round((r.confidence ?? 0) * 100)}%
                          </p>
                        )}
                        {/* Flags shown inline */}
                        {r.flags?.length > 0 && r.flags.map((f: any) => (
                          <p key={f.id} style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>
                            ⚠️ {f.flagType.replace(/_/g, " ")}: {f.message}
                          </p>
                        ))}
                      </div>

                      {/* Right: total + actions */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-mono)", marginBottom: 8 }}>
                          {r.currency !== "IDR" ? `${r.declaredTotal} ${r.currency}` : fmtFull(r.declaredTotal ?? 0)}
                        </p>

                        {/* Inline reject reason */}
                        {rejectId === r.id ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", minWidth: 240 }}>
                            <input
                              className="input"
                              placeholder="Reason for rejection (optional)"
                              value={rejectNote}
                              onChange={e => setRejectNote(e.target.value)}
                              style={{ fontSize: 12 }}
                            />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn btn-sm btn-ghost" onClick={() => setRejectId(null)}>Cancel</button>
                              <button
                                className="btn btn-sm btn-danger"
                                disabled={actioning === r.id}
                                onClick={() => handleAction(r.id, "reject", rejectNote)}
                              >
                                {actioning === r.id ? "..." : "Confirm Reject"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                            {!r.lineItems?.length && r.status === "pending" && (
                              <button
                                className="btn btn-sm btn-outline"
                                disabled={processing === r.id}
                                onClick={() => handleProcess(r.id)}
                              >
                                {processing === r.id ? "🔄 OCR..." : "🤖 Run OCR"}
                              </button>
                            )}
                            <button
                              className="btn btn-sm btn-success"
                              disabled={actioning === r.id}
                              onClick={() => handleAction(r.id, "approve")}
                            >
                              {actioning === r.id ? "..." : "✅ Approve"}
                            </button>
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => setRejectId(r.id)}
                            >
                              ❌ Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Line items preview */}
                    {r.lineItems?.length > 0 && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Line Items</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
                          {r.lineItems.slice(0, 6).map((item: any) => (
                            <div key={item.id} style={{ background: "var(--surface-alt)", padding: "6px 10px", borderRadius: 6, fontSize: 11 }}>
                              <p style={{ fontWeight: 500, color: "var(--text)" }}>{item.rawDescription}</p>
                              <p style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                                {item.quantity}× {formatRupiah(item.unitPrice)} = {formatRupiah(item.totalPrice)}
                              </p>
                            </div>
                          ))}
                          {r.lineItems.length > 6 && (
                            <div style={{ background: "var(--surface-alt)", padding: "6px 10px", borderRadius: 6, fontSize: 11, color: "var(--text-secondary)", textAlign: "center" }}>
                              +{r.lineItems.length - 6} more items
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* APPROVED */}
          {approvedGroup.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--profit)", display: "inline-block" }} />
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--profit)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Approved ({approvedGroup.length})
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {approvedGroup.map(r => (
                  <div key={r.id} className="receipt-card status-approved" style={{ padding: "12px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 14 }}>{r.receiptType === "buyer" ? "📥" : "📤"}</span>
                        <div>
                          <p style={{ fontWeight: 500, fontSize: 13 }}>{r.merchantName ?? r.customerName ?? "—"}</p>
                          <p style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                            {r.invoiceNumber ?? "—"} · {formatDate(r.receiptDate)}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className={`badge badge-${r.receiptType}`} style={{ fontSize: 10 }}>{r.receiptType}</span>
                        <span className="badge badge-approved" style={{ fontSize: 10 }}>✓ {r.status}</span>
                        <p style={{ fontWeight: 700, fontSize: 13, fontFamily: "var(--font-mono)" }}>
                          {r.currency !== "IDR" ? `${r.declaredTotal} ${r.currency}` : fmtFull(r.declaredTotal ?? 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* REJECTED */}
          {otherGroup.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--cogs)", display: "inline-block" }} />
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--cogs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Rejected ({otherGroup.length})
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {otherGroup.map(r => (
                  <div key={r.id} className="receipt-card status-rejected" style={{ padding: "12px 20px", opacity: 0.7 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 14 }}>📥</span>
                        <div>
                          <p style={{ fontWeight: 500, fontSize: 13 }}>{r.merchantName ?? r.customerName ?? "—"}</p>
                          <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{formatDate(r.receiptDate)}</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="badge badge-rejected" style={{ fontSize: 10 }}>✗ rejected</span>
                        <p style={{ fontWeight: 700, fontSize: 13, fontFamily: "var(--font-mono)" }}>
                          {r.currency !== "IDR" ? `${r.declaredTotal} ${r.currency}` : fmtFull(r.declaredTotal ?? 0)}
                        </p>
                      </div>
                    </div>
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

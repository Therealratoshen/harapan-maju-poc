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

  // ── Edit modal state ────────────────────────────────────
  const [editReceipt,   setEditReceipt]   = useState<any | null>(null);
  const [editLineItems, setEditLineItems] = useState<any[]>([]);
  const [editDeclaredTotal, setEditDeclaredTotal] = useState<number>(0);
  const [editMerchant,   setEditMerchant]   = useState("");
  const [editInvoice,    setEditInvoice]    = useState("");
  const [editDate,       setEditDate]        = useState("");
  const [editSaving,     setEditSaving]      = useState(false);
  const [editNewItem,    setEditNewItem]    = useState({ description: "", quantity: "1", unit: "pcs", unitPrice: "0", totalPrice: "" });

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

  // ── Open edit modal ────────────────────────────────────
  const openEdit = async (receipt: any) => {
    setEditReceipt(receipt);
    setEditMerchant(receipt.merchantName ?? "");
    setEditInvoice(receipt.invoiceNumber ?? "");
    setEditDate(receipt.receiptDate ? new Date(receipt.receiptDate).toISOString().slice(0, 10) : "");
    setEditDeclaredTotal(receipt.declaredTotal ?? 0);
    setEditNewItem({ description: "", quantity: "1", unit: "pcs", unitPrice: "0", totalPrice: "" });

    // Load line items
    try {
      const res  = await fetch(`/api/receipts/${receipt.id}/line-items`);
      const data = await res.json();
      setEditLineItems(data.items ?? data.lineItems ?? []);
    } catch {
      setEditLineItems([]);
    }
  };

  // ── Save edit ──────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (!editReceipt) return;
    setEditSaving(true);
    try {
      // Update receipt metadata
      await fetch(`/api/receipts/${editReceipt.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantName:   editMerchant,
          invoiceNumber:  editInvoice,
          receiptDate:    editDate,
          declaredTotal: editDeclaredTotal,
        }),
      });

      // Run recheck (recalculate computed_total + update flags)
      await fetch(`/api/receipts/${editReceipt.id}/recheck`, { method: "POST" });

      showToast(`Receipt #${editReceipt.id} updated`, "success");
      setEditReceipt(null);
      load();
    } catch {
      showToast("Save failed — try again", "error");
    } finally {
      setEditSaving(false);
    }
  };

  // ── Line item CRUD in modal ───────────────────────────
  const updateLocalItem = (index: number, field: string, value: string) => {
    const updated = [...editLineItems];
    const item    = { ...updated[index] };

    if (field === "unitPrice" || field === "quantity") {
      item[field] = parseInt(value) || 0;
      item.totalPrice = item.quantity * item.unitPrice;
    } else {
      (item as any)[field] = value;
    }
    updated[index] = item;
    setEditLineItems(updated);
  };

  const deleteLocalItem = async (index: number) => {
    const item = editLineItems[index];
    if (!item.id) { setEditLineItems(editLineItems.filter((_, i) => i !== index)); return; }
    await fetch(`/api/receipts/${editReceipt!.id}/line-items/${item.id}`, { method: "DELETE" });
    setEditLineItems(editLineItems.filter((_, i) => i !== index));
  };

  const addLineItem = async () => {
    if (!editReceipt) return;
    const ni = editNewItem;
    const res = await fetch(`/api/receipts/${editReceipt.id}/line-items`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: ni.description,
        quantity:    parseFloat(ni.quantity) || 1,
        unit:        ni.unit,
        unitPrice:  parseInt(ni.unitPrice) || 0,
      }),
    });
    const data = await res.json();
    if (data.lineItem) setEditLineItems([...editLineItems, data.lineItem]);
    setEditNewItem({ description: "", quantity: "1", unit: "pcs", unitPrice: "0", totalPrice: "" });
  };

  const saveItem = async (index: number) => {
    const item = editLineItems[index];
    if (!item.id) return;
    const res = await fetch(`/api/receipts/${editReceipt!.id}/line-items/${item.id}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: item.rawDescription,
        quantity:    item.quantity,
        unit:        item.unit,
        unitPrice:  item.unitPrice,
      }),
    });
    const data = await res.json();
    if (data.lineItem) {
      const updated = [...editLineItems];
      updated[index] = data.lineItem;
      setEditLineItems(updated);
    }
  };

  const computedTotal = editLineItems.reduce((s, i) => s + (i.totalPrice ?? 0), 0);
  const variance     = Math.abs(editDeclaredTotal - computedTotal);
  const variancePct  = computedTotal > 0 ? (variance / computedTotal) * 100 : 0;

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

                      {/* Right: total + variance + actions */}
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        {/* Declared total */}
                        <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-mono)", marginBottom: 2 }}>
                          {r.currency !== "IDR" ? `${r.declaredTotal} ${r.currency}` : fmtFull(r.declaredTotal ?? 0)}
                        </p>
                        {/* Computed total + variance (if different) */}
                        {(r.computedTotal ?? 0) > 0 && (
                          <p style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", marginBottom: 2 }}>
                            computed: {fmtFull(r.computedTotal)}
                          </p>
                        )}
                        {(r.computedTotal ?? 0) > 0 && (
                          <p style={{
                            fontSize: 11,
                            fontFamily: "var(--font-mono)",
                            fontWeight: 600,
                            color: Math.abs((r.declaredTotal ?? 0) - (r.computedTotal ?? 0)) > 0 ? "var(--danger)" : "var(--profit)",
                            marginBottom: 6,
                          }}>
                            {(() => {
                              const diff = (r.declaredTotal ?? 0) - (r.computedTotal ?? 0);
                              const pct  = r.computedTotal ? ((diff / r.computedTotal) * 100).toFixed(1) : "0";
                              return diff === 0 ? "✓ match" : `Δ Rp ${Math.abs(diff / 1000000).toFixed(1)}M (${pct}%)`;
                            })()}
                          </p>
                        )}
                        {(r.computedTotal ?? 0) === 0 && !r.lineItems?.length && (
                          <p style={{ fontSize: 11, color: "var(--warning)", fontWeight: 600, marginBottom: 6 }}>
                            ⚠ no OCR data
                          </p>
                        )}

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
                            {/* Run OCR — prominent for receipts with no line items */}
                            {!r.lineItems?.length && r.status === "pending" && (
                              <button
                                className="btn btn-sm"
                                style={{ background: "rgba(8,145,178,0.12)", color: "var(--accent)", border: "1px solid rgba(8,145,178,0.3)", fontWeight: 600 }}
                                disabled={processing === r.id}
                                onClick={() => handleProcess(r.id)}
                              >
                                {processing === r.id ? "🔄 OCR berjalan..." : "🤖 Jalankan OCR"}
                              </button>
                            )}
                            {/* Re-run OCR for flagged low-confidence receipts */}
                            {r.lineItems?.length > 0 && (r.confidence ?? 0) < 0.6 && (
                              <button
                                className="btn btn-sm btn-outline"
                                style={{ fontSize: 11, padding: "4px 8px" }}
                                disabled={processing === r.id}
                                onClick={() => handleProcess(r.id)}
                              >
                                🔄 Re-OCR
                              </button>
                            )}
                            {/* Edit button — always available for pending/flagged */}
                            {(r.status === "pending" || r.status === "flagged") && (
                              <button
                                className="btn btn-sm"
                                style={{ background: "rgba(0,229,255,0.08)", color: "var(--accent)", border: "1px solid rgba(0,229,255,0.3)", fontWeight: 600 }}
                                onClick={() => openEdit(r)}
                              >
                                ✏️ Edit
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
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <span className={`badge badge-${r.receiptType}`} style={{ fontSize: 10 }}>{r.receiptType}</span>
                        <span className="badge badge-approved" style={{ fontSize: 10 }}>✓ {r.status}</span>
                        {/* Variance indicator */}
                        {(r.computedTotal ?? 0) > 0 && (
                          <span style={{
                            fontSize: 10, fontFamily: "var(--font-mono)",
                            color: Math.abs((r.declaredTotal ?? 0) - (r.computedTotal ?? 0)) > 0 ? "var(--warning)" : "var(--profit)",
                            fontWeight: 600,
                          }}>
                            {(() => {
                              const diff = (r.declaredTotal ?? 0) - (r.computedTotal ?? 0);
                              if (diff === 0) return "✓";
                              const pct = ((Math.abs(diff) / (r.computedTotal ?? 1)) * 100).toFixed(0) + "%";
                              return `${diff > 0 ? "+" : "−"}${Math.abs(diff / 1000000).toFixed(1)}M (${pct})`;
                            })()}
                          </span>
                        )}
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

      {/* ── Edit Receipt Modal ──────────────────────────────── */}
      {editReceipt && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000,
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            padding: "24px 16px", overflowY: "auto",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditReceipt(null); }}
        >
          <div
            style={{
              background: "var(--surface-raised)", border: "1px solid var(--border-default)",
              borderRadius: 16, width: "100%", maxWidth: 820,
              display: "flex", flexDirection: "column", gap: 0,
              boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
            }}
          >
            {/* ── Modal header ── */}
            <div style={{
              padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>✏️</span>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>
                    Edit Receipt #{editReceipt.id}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {editReceipt.receiptType === "buyer" ? "Supplier Purchase" : "Customer Sale"}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`badge badge-${editReceipt.status}`} style={{ fontSize: 10 }}>
                  {editReceipt.status}
                </span>
                <button
                  onClick={() => setEditReceipt(null)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-secondary)", padding: 4, lineHeight: 1 }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* ── Metadata row ── */}
            <div style={{
              padding: "16px 24px", borderBottom: "1px solid var(--border-subtle)",
              display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12,
            }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
                  Merchant / Supplier
                </label>
                <input
                  value={editMerchant}
                  onChange={e => setEditMerchant(e.target.value)}
                  style={{
                    width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)",
                    borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "var(--text)", outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--border-default)")}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
                  Invoice Number
                </label>
                <input
                  value={editInvoice}
                  onChange={e => setEditInvoice(e.target.value)}
                  placeholder="e.g. INV-001"
                  style={{
                    width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)",
                    borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "var(--text)", outline: "none",
                    boxSizing: "border-box", fontFamily: "var(--font-mono)",
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--border-default)")}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
                  Receipt Date
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={e => setEditDate(e.target.value)}
                  style={{
                    width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)",
                    borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "var(--text)", outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--border-default)")}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>
                  Declared Total (Rp)
                </label>
                <input
                  type="number"
                  value={editDeclaredTotal}
                  onChange={e => setEditDeclaredTotal(parseInt(e.target.value) || 0)}
                  style={{
                    width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)",
                    borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "var(--text)", outline: "none",
                    boxSizing: "border-box", fontFamily: "var(--font-mono)",
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--border-default)")}
                />
              </div>
            </div>

            {/* ── Financials summary ── */}
            <div style={{
              padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)",
              display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap",
            }}>
              <div>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>Computed from {editLineItems.length} line item{editLineItems.length !== 1 ? "s" : ""}</p>
                <p style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--text)" }}>
                  {fmtFull(computedTotal)}
                </p>
              </div>
              <div style={{ width: 1, height: 32, background: "var(--border-subtle)" }} />
              <div>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>Variance</p>
                <p style={{
                  fontSize: 18, fontWeight: 700, fontFamily: "var(--font-mono)",
                  color: variance === 0 ? "var(--profit)" : "var(--danger)",
                }}>
                  {variance === 0 ? "✓ Matched" : `${variancePct > 0 ? "Δ" : ""}${variancePct.toFixed(1)}%`}
                </p>
              </div>
              <div style={{ width: 1, height: 32, background: "var(--border-subtle)" }} />
              <div>
                <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>Line items</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)" }}>{editLineItems.length}</p>
              </div>
            </div>

            {/* ── Line items table ── */}
            <div style={{ padding: "0 24px", flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 10px" }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Line Items</p>
                <button
                  onClick={() => setEditLineItems([...editLineItems, { id: null, rawDescription: "", quantity: 1, unit: "pcs", unitPrice: 0, totalPrice: 0 }])}
                  style={{
                    background: "none", border: "1px dashed var(--border-default)", borderRadius: 8,
                    padding: "5px 12px", fontSize: 12, color: "var(--accent)", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  + Add row
                </button>
              </div>

              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 70px 80px 100px 100px 50px",
                gap: 6, padding: "6px 8px",
                borderRadius: 6, marginBottom: 4,
                background: "var(--surface-alt)",
              }}>
                {["Description", "Qty", "Unit", "Unit Price", "Total", ""].map(h => (
                  <span key={h} style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
                ))}
              </div>

              {/* Existing items */}
              {editLineItems.length === 0 && (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-secondary)", fontSize: 13 }}>
                  No line items. Add one below.
                </div>
              )}

              {editLineItems.map((item, idx) => {
                const isUnsaved = !item.id;
                return (
                  <div
                    key={item.id ?? `new-${idx}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 70px 80px 100px 100px 50px",
                      gap: 6, padding: "4px 8px",
                      borderRadius: 8, marginBottom: 4,
                      background: isUnsaved ? "rgba(0,229,255,0.04)" : "transparent",
                      border: isUnsaved ? "1px dashed var(--accent)" : "1px solid transparent",
                      alignItems: "center",
                    }}
                  >
                    <input
                      value={item.rawDescription ?? item.description ?? ""}
                      onChange={e => updateLocalItem(idx, "rawDescription", e.target.value)}
                      placeholder="Item description"
                      style={{
                        background: "var(--surface-alt)", border: "1px solid var(--border-default)",
                        borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "var(--text)", outline: "none",
                      }}
                      onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                      onBlur={e => (e.target.style.borderColor = "var(--border-default)")}
                    />
                    <input
                      type="number"
                      value={item.quantity}
                      min={0}
                      onChange={e => updateLocalItem(idx, "quantity", e.target.value)}
                      style={{
                        background: "var(--surface-alt)", border: "1px solid var(--border-default)",
                        borderRadius: 6, padding: "5px 6px", fontSize: 12, color: "var(--text)", outline: "none",
                        fontFamily: "var(--font-mono)", textAlign: "right",
                      }}
                      onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                      onBlur={e => (e.target.style.borderColor = "var(--border-default)")}
                    />
                    <input
                      value={item.unit ?? "pcs"}
                      onChange={e => updateLocalItem(idx, "unit", e.target.value)}
                      style={{
                        background: "var(--surface-alt)", border: "1px solid var(--border-default)",
                        borderRadius: 6, padding: "5px 6px", fontSize: 12, color: "var(--text)", outline: "none",
                      }}
                      onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                      onBlur={e => (e.target.style.borderColor = "var(--border-default)")}
                    />
                    <input
                      type="number"
                      value={item.unitPrice ?? 0}
                      min={0}
                      onChange={e => updateLocalItem(idx, "unitPrice", e.target.value)}
                      placeholder="0"
                      style={{
                        background: "var(--surface-alt)", border: "1px solid var(--border-default)",
                        borderRadius: 6, padding: "5px 6px", fontSize: 12, color: "var(--text)", outline: "none",
                        fontFamily: "var(--font-mono)", textAlign: "right",
                      }}
                      onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                      onBlur={e => (e.target.style.borderColor = "var(--border-default)")}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", fontFamily: "var(--font-mono)", textAlign: "right" }}>
                      {fmtFull((item.quantity ?? 0) * (item.unitPrice ?? 0))}
                    </span>
                    <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                      {isUnsaved ? (
                        <button
                          onClick={() => addLineItem().then(() => {})}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--profit)", padding: "2px 4px" }}
                          title="Save this row"
                        >
                          ✓
                        </button>
                      ) : (
                        <button
                          onClick={() => saveItem(idx)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--accent)", padding: "2px 4px" }}
                          title="Save item"
                        >
                          💾
                        </button>
                      )}
                      <button
                        onClick={() => deleteLocalItem(idx)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--danger)", padding: "2px 4px" }}
                        title="Remove"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Quick-add row */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 70px 80px 100px auto",
                gap: 6, padding: "8px",
                borderRadius: 8, margin: "8px 0 16px",
                background: "rgba(0,229,255,0.03)", border: "1px dashed var(--border-subtle)",
                alignItems: "center",
              }}>
                <input
                  value={editNewItem.description}
                  onChange={e => setEditNewItem({ ...editNewItem, description: e.target.value })}
                  placeholder="New item description…"
                  style={{
                    background: "var(--surface-alt)", border: "1px solid var(--border-default)",
                    borderRadius: 6, padding: "5px 8px", fontSize: 12, color: "var(--text)", outline: "none",
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--border-default)")}
                />
                <input
                  type="number"
                  value={editNewItem.quantity}
                  min={1}
                  onChange={e => setEditNewItem({ ...editNewItem, quantity: e.target.value })}
                  style={{
                    background: "var(--surface-alt)", border: "1px solid var(--border-default)",
                    borderRadius: 6, padding: "5px 6px", fontSize: 12, color: "var(--text)", outline: "none",
                    fontFamily: "var(--font-mono)", textAlign: "right",
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--border-default)")}
                />
                <input
                  value={editNewItem.unit}
                  onChange={e => setEditNewItem({ ...editNewItem, unit: e.target.value })}
                  style={{
                    background: "var(--surface-alt)", border: "1px solid var(--border-default)",
                    borderRadius: 6, padding: "5px 6px", fontSize: 12, color: "var(--text)", outline: "none",
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--border-default)")}
                />
                <input
                  type="number"
                  value={editNewItem.unitPrice}
                  min={0}
                  onChange={e => setEditNewItem({ ...editNewItem, unitPrice: e.target.value })}
                  placeholder="Rp"
                  style={{
                    background: "var(--surface-alt)", border: "1px solid var(--border-default)",
                    borderRadius: 6, padding: "5px 6px", fontSize: 12, color: "var(--text)", outline: "none",
                    fontFamily: "var(--font-mono)", textAlign: "right",
                  }}
                  onFocus={e => (e.target.style.borderColor = "var(--accent)")}
                  onBlur={e => (e.target.style.borderColor = "var(--border-default)")}
                />
                <button
                  onClick={addLineItem}
                  style={{
                    background: "var(--accent)", border: "none", borderRadius: 8,
                    padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#000", cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  + Add
                </button>
              </div>
            </div>

            {/* ── Modal footer ── */}
            <div style={{
              padding: "16px 24px", borderTop: "1px solid var(--border-subtle)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, flexWrap: "wrap",
            }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Computed total: <strong style={{ color: "var(--text)" }}>{fmtFull(computedTotal)}</strong>
                {" "}
                {variance > 0 && (
                  <span style={{ color: "var(--danger)" }}>· Variance {variancePct.toFixed(1)}%</span>
                )}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setEditReceipt(null)}
                  style={{
                    background: "var(--surface-alt)", border: "1px solid var(--border-default)",
                    borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 600,
                    color: "var(--text-secondary)", cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={editSaving}
                  style={{
                    background: editSaving ? "var(--surface-alt)" : "var(--accent)",
                    border: "none", borderRadius: 10, padding: "9px 18px",
                    fontSize: 13, fontWeight: 700, color: "#000", cursor: editSaving ? "wait" : "pointer",
                    opacity: editSaving ? 0.7 : 1, display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {editSaving ? "💾 Saving…" : "💾 Save & Check Flags"}
                </button>
              </div>
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

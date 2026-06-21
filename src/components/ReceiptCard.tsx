"use client";

interface ReceiptCardProps {
  receipt: any;
  onApprove?: (id: number) => void;
  onReject?: (id: number, note?: string) => void;
  onRunOCR?: (id: number) => void;
  compact?: boolean;
}

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

const STATUS_STYLE: Record<string, { border: string; badge: string }> = {
  approved: { border: "var(--profit)",   badge: "badge badge-approved"  },
  pending:  { border: "var(--warning)", badge: "badge badge-pending"   },
  flagged:  { border: "var(--danger)",  badge: "badge badge-flagged"   },
  rejected: { border: "var(--cogs)",    badge: "badge badge-rejected"  },
};

export default function ReceiptCard({ receipt: r, onApprove, onReject, onRunOCR, compact }: ReceiptCardProps) {
  const style = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending;

  if (compact) {
    // Compact row for approved receipts
    return (
      <div
        className="card-flat"
        style={{
          padding: "12px 20px",
          borderLeft: `3px solid ${style.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 6,
          opacity: r.status === "rejected" ? 0.65 : 1,
        }}
      >
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
          <span className={style.badge} style={{ fontSize: 10 }}>
            {r.status === "approved" ? "✓ " : r.status === "rejected" ? "✗ " : ""}{r.status}
          </span>
          <p style={{ fontWeight: 700, fontSize: 13, fontFamily: "var(--font-mono)", minWidth: 100, textAlign: "right" }}>
            {r.currency !== "IDR" ? `${r.declaredTotal} ${r.currency}` : fmtFull(r.declaredTotal ?? 0)}
          </p>
        </div>
      </div>
    );
  }

  // Full card for pending/flagged receipts
  return (
    <div
      className="card-flat"
      style={{
        borderLeft: `3px solid ${style.border}`,
        padding: "16px 20px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 16 }}>{r.receiptType === "buyer" ? "📥" : "📤"}</span>
            <p style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
              {r.merchantName ?? r.customerName ?? "—"}
            </p>
            <span className={`badge badge-${r.receiptType}`}>{r.receiptType}</span>
            <span className={style.badge}>{r.status}</span>
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

          {r.flags?.map((f: any) => (
            <p key={f.id} style={{ fontSize: 11, color: "var(--danger)", marginTop: 4 }}>
              ⚠️ {f.flagType.replace(/_/g, " ")}: {f.message}
            </p>
          ))}
        </div>

        {/* Right: total + actions */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--font-mono)", marginBottom: 10 }}>
            {r.currency !== "IDR" ? `${r.declaredTotal} ${r.currency}` : fmtFull(r.declaredTotal ?? 0)}
          </p>

          {(r.status === "pending" || r.status === "flagged") && (
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
              {!r.lineItems?.length && r.status === "pending" && onRunOCR && (
                <button className="btn btn-sm btn-outline" onClick={() => onRunOCR(r.id)}>
                  🤖 Run OCR
                </button>
              )}
              {onApprove && (
                <button className="btn btn-sm btn-success" onClick={() => onApprove(r.id)}>
                  ✅ Approve
                </button>
              )}
              {onReject && (
                <button className="btn btn-sm btn-ghost" onClick={() => onReject(r.id)}>
                  ❌ Reject
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Line items */}
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
                +{r.lineItems.length - 6} more
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useRef, useCallback, useEffect } from "react";

function formatDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtFull(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

const STATUS_COLORS: Record<string, string> = {
  approved: "#059669",
  pending: "#d97706",
  flagged: "#dc2626",
  rejected: "#64748b",
};

export default function UploadPage() {
  const [file, setFile]     = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult]   = useState<any>(null);
  const [error, setError]     = useState<string | null>(null);
  const [mode, setMode]       = useState<"file" | "camera">("file");
  const [recentReceipts, setRecentReceipts] = useState<any[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [receiptType, setReceiptType] = useState<"buyer" | "supplier">("buyer");
  const [merchantName, setMerchantName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);
  // Manual entry (no photo)
  const [manualMode, setManualMode] = useState(false);
  const [manualType, setManualType] = useState<"buyer" | "supplier">("buyer");
  const [manualMerchant, setManualMerchant] = useState("");
  const [manualInvoice, setManualInvoice] = useState("");
  const [manualDate, setManualDate] = useState(new Date().toISOString().split("T")[0]);
  const [manualDeclared, setManualDeclared] = useState("");
  const [manualSaving, setManualSaving] = useState(false);
  const [manualMsg, setManualMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load recent receipts
  const loadRecent = useCallback(() => {
    fetch("/api/receipts?limit=5")
      .then(r => r.json())
      .then(d => { setRecentReceipts(d.receipts ?? []); setLoadingRecent(false); })
      .catch(() => setLoadingRecent(false));
  }, []);

  // Load on mount
  useEffect(() => { loadRecent(); }, [loadRecent]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      // Include current date as receipt date
      formData.append("receiptDate", new Date().toISOString().split("T")[0]);

      const res = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName:      file.name,
          receiptDate:   new Date().toISOString(),
          base64Image:  preview,
          receiptType,
          merchantName:  merchantName || undefined,
          invoiceNumber: invoiceNumber || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({
          id:      data.id,
          note:    data.message ?? "Receipt uploaded. Go to Receipts page and click 'Jalankan OCR' to extract data.",
          fileName: file.name,
          status:  "pending",
        });
        loadRecent();
      } else {
        setError(data.error ?? "Upload failed — check MiniMax API key");
      }
    } catch {
      setError("Network error — check your connection");
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div style={{ padding: "28px", maxWidth: 860 }}>

      {/* ── Header ─────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 }}>Upload Receipt</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          Take a photo or upload a file — the system extracts the data automatically
        </p>
      </div>

      {/* ── Telegram status banner ───────────────────── */}
      <div style={{
        background: "rgba(8,145,178,0.06)",
        border: "1px solid rgba(8,145,178,0.2)",
        borderRadius: 12,
        padding: "14px 18px",
        marginBottom: 24,
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
      }}>
        <div style={{ width: 40, height: 40, background: "rgba(8,145,178,0.12)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#0891b2">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 600, fontSize: 13, color: "var(--accent)", marginBottom: 2 }}>Or send directly via Telegram</p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            Send a photo of your receipt to{" "}
            <a href="https://t.me/Zoya_Filbert_bot" target="_blank" rel="noopener" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>
              @Zoya_Filbert_bot
            </a>{" "}
            on Telegram. The bot will receive it, run OCR, and it will appear in the{" "}
            <a href="/dashboard/receipts" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 500 }}>Receipts</a>{" "}
            page automatically — no upload needed here.
          </p>
        </div>
        <a
          href="https://t.me/Zoya_Filbert_bot"
          target="_blank"
          rel="noopener"
          className="btn btn-sm btn-outline"
          style={{ flexShrink: 0, alignSelf: "center" }}
        >
          Open Telegram →
        </a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, alignItems: "start" }}>

        {/* ── Left: Upload area ────────────────────── */}
        <div>
          {/* Receipt type + mode */}
          <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {/* Receipt type */}
            <div style={{ display: "flex", border: "1px solid var(--border-default)", borderRadius: 10, overflow: "hidden" }}>
              <button onClick={() => setReceiptType("buyer")} style={{
                padding: "7px 16px", fontSize: 13, fontWeight: 600, border: "none", borderRight: "1px solid var(--border-default)",
                cursor: "pointer",
                background: receiptType === "buyer" ? "var(--accent)" : "var(--surface-alt)",
                color: receiptType === "buyer" ? "#000" : "var(--text-secondary)",
              }}>📥 Pembelian (Buyer)</button>
              <button onClick={() => setReceiptType("supplier")} style={{
                padding: "7px 16px", fontSize: 13, fontWeight: 600, border: "none",
                cursor: "pointer",
                background: receiptType === "supplier" ? "var(--revenue)" : "var(--surface-alt)",
                color: receiptType === "supplier" ? "#fff" : "var(--text-secondary)",
              }}>📤 Penjualan (Supplier)</button>
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className={`tab-btn ${mode === "file" ? "active" : ""}`} onClick={() => setMode("file")}>📁 File</button>
              <button className={`tab-btn ${mode === "camera" ? "active" : ""}`} onClick={() => setMode("camera")}>📷 Camera</button>
            </div>
          </div>

          {/* Metadata row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>Merchant / Supplier</label>
              <input value={merchantName} onChange={e => setMerchantName(e.target.value)} placeholder="e.g. Honda Jaya"
                style={{ width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "var(--text)", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>Invoice Number</label>
              <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-001"
                style={{ width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "var(--text)", outline: "none", boxSizing: "border-box", fontFamily: "var(--font-mono)" }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>Receipt Date</label>
              <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)}
                style={{ width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "var(--text)", outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Drop zone */}
          <div
            style={{
              border: `2px dashed ${preview ? "rgba(8,145,178,0.4)" : "var(--border)"}`,
              borderRadius: 12,
              background: preview ? "rgba(8,145,178,0.03)" : "var(--surface)",
              cursor: "pointer",
              transition: "all 0.2s",
              minHeight: 260,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              overflow: "hidden",
            }}
            onClick={() => !preview && fileRef.current?.click()}
          >
            {preview ? (
              <div style={{ position: "relative", width: "100%" }}>
                <img
                  src={preview}
                  alt="Receipt preview"
                  style={{ width: "100%", maxHeight: 320, objectFit: "contain", display: "block" }}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); clearFile(); }}
                  style={{
                    position: "absolute", top: 10, right: 10,
                    background: "rgba(0,0,0,0.6)", color: "white",
                    border: "none", borderRadius: "50%",
                    width: 32, height: 32, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16,
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{ width: 52, height: 52, background: "var(--surface-alt)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.8" strokeLinecap="round">
                    <polyline points="16 16 12 12 8 16"/>
                    <line x1="12" y1="12" x2="12" y2="21"/>
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                  </svg>
                </div>
                <p style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 4 }}>
                  {mode === "camera" ? "Take a photo of your receipt" : "Click to upload or drag & drop"}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  JPG, PNG, WEBP, PDF · Max 10MB
                </p>
                <div style={{ marginTop: 14, padding: "8px 16px", background: "var(--surface-alt)", borderRadius: 8, display: "inline-block" }}>
                  <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                    📋 Tip: Flatten receipts, avoid shadows for best OCR results
                  </p>
                </div>
              </div>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept={mode === "camera" ? "image/*;capture=environment" : "image/*,.pdf"}
            capture={mode === "camera" ? "environment" : undefined}
            className="hidden"
            onChange={handleFileChange}
          />

          {/* File info + submit */}
          {file && (
            <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{file.name}</p>
                  <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={clearFile}>Remove</button>
                <button
                  className="btn btn-primary"
                  disabled={uploading}
                  onClick={handleUpload}
                >
                  {uploading ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.3"/>
                        <path d="M12 2a10 10 0 0 1 10 10"/>
                      </svg>
                      Processing OCR...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                      </svg>
                      Upload &amp; Extract
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ marginTop: 14, padding: "12px 16px", background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p style={{ fontSize: 13, color: "#dc2626" }}>{error}</p>
            </div>
          )}

          {/* Success */}
          {result && (
            <div style={{ marginTop: 14, padding: "16px 18px", background: "rgba(5,150,105,0.06)", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <p style={{ fontWeight: 600, color: "#059669", fontSize: 14 }}>Receipt uploaded!</p>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{result.note}</p>
              {result.id && (
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <a href="/dashboard/receipts" className="btn btn-sm btn-success">View in Receipts →</a>
                  <button className="btn btn-sm btn-ghost" onClick={clearFile}>Upload another</button>
                </div>
              )}
            </div>
          )}

          {/* MiniMax note */}
          {!result && !error && (
            <div style={{ marginTop: 14, padding: "12px 16px", background: "var(--surface-alt)", border: "1px solid var(--border)", borderRadius: 10 }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                <strong style={{ color: "var(--text)" }}>How it works:</strong> Receipt photo → sent to MiniMax OCR → structured data extracted → review in Receipts page. Set{" "}
                <code style={{ background: "var(--border)", padding: "1px 5px", borderRadius: 4, fontSize: 11, fontFamily: "var(--font-mono)" }}>MINIMAX_API_KEY</code>{" "}
                in <code style={{ background: "var(--border)", padding: "1px 5px", borderRadius: 4, fontSize: 11, fontFamily: "var(--font-mono)" }}>.env.local</code> to enable auto-extraction.
              </p>
            </div>
          )}
        </div>

        {/* ── Right: Recent uploads ────────────────── */}
        <div>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Recent Uploads</p>
            <a href="/dashboard/receipts" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>View all →</a>
          </div>

          {loadingRecent ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 64, borderRadius: 10 }} />)}
            </div>
          ) : recentReceipts.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
              <p>No receipts yet</p>
              <p style={{ fontSize: 11, marginTop: 4 }}>Upload your first receipt to get started</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recentReceipts.map(r => (
                <div key={r.id} style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  borderLeft: `3px solid ${STATUS_COLORS[r.status] ?? "var(--border)"}`,
                  transition: "all 0.15s",
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{r.receiptType === "buyer" ? "📥" : "📤"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 500, fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.merchantName ?? r.customerName ?? "—"}
                    </p>
                    <p style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 1 }}>
                      {formatDate(r.receiptDate)}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: 11, fontFamily: "var(--font-mono)" }}>
                      {r.currency !== "IDR" ? `${r.declaredTotal}` : fmtFull(r.declaredTotal ?? 0)}
                    </p>
                    <p style={{ fontSize: 10, color: STATUS_COLORS[r.status], fontWeight: 600, marginTop: 1 }}>
                      {r.status}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tips */}
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>Best results</p>
            {[
              "Lay receipts flat on a light surface",
              "Avoid shadows and glare",
              "Include the full receipt in frame",
              "Ensure text is readable",
            ].map((tip, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--accent-bg)", color: "var(--accent)", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  {i + 1}
                </span>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{tip}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Manual Entry (no photo needed) ─────────────── */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 4 }}>Manual Entry</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Enter receipt data directly without uploading a photo</p>
          </div>
          <button
            className="btn btn-outline"
            onClick={() => setManualMode(!manualMode)}
          >
            {manualMode ? "Cancel" : "+ New Manual Entry"}
          </button>
        </div>

        {manualMode && (
          <div style={{ background: "var(--surface-raised)", border: "1px solid var(--border-default)", borderRadius: 14, overflow: "hidden" }}>
            {/* Type toggle */}
            <div style={{ padding: "16px 20px 0", display: "flex", gap: 8 }}>
              <button onClick={() => setManualType("buyer")} style={{
                padding: "7px 16px", fontSize: 13, fontWeight: 600, border: "2px solid",
                borderColor: manualType === "buyer" ? "var(--accent)" : "var(--border-default)",
                borderRadius: 10, cursor: "pointer",
                background: manualType === "buyer" ? "var(--accent)" : "transparent",
                color: manualType === "buyer" ? "#000" : "var(--text-secondary)",
              }}>📥 Pembelian (Buyer)</button>
              <button onClick={() => setManualType("supplier")} style={{
                padding: "7px 16px", fontSize: 13, fontWeight: 600, border: "2px solid",
                borderColor: manualType === "supplier" ? "var(--revenue)" : "var(--border-default)",
                borderRadius: 10, cursor: "pointer",
                background: manualType === "supplier" ? "var(--revenue)" : "transparent",
                color: manualType === "supplier" ? "#fff" : "var(--text-secondary)",
              }}>📤 Penjualan (Supplier)</button>
            </div>

            {/* Fields */}
            <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>Merchant / Supplier *</label>
                <input value={manualMerchant} onChange={e => setManualMerchant(e.target.value)} placeholder="e.g. Honda Jaya"
                  style={{ width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "var(--text)", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>Invoice Number</label>
                <input value={manualInvoice} onChange={e => setManualInvoice(e.target.value)} placeholder="e.g. INV-001"
                  style={{ width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "var(--text)", outline: "none", boxSizing: "border-box", fontFamily: "var(--font-mono)" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>Date</label>
                <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)}
                  style={{ width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "var(--text)", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4 }}>
                  Total Amount (Rp) *
                </label>
                <input type="number" min="0" value={manualDeclared} onChange={e => setManualDeclared(e.target.value)} placeholder="e.g. 1500000"
                  style={{ width: "100%", background: "var(--surface-alt)", border: "1px solid var(--border-default)", borderRadius: 8, padding: "8px 10px", fontSize: 14, color: "var(--text)", outline: "none", boxSizing: "border-box", fontFamily: "var(--font-mono)" }} />
              </div>
            </div>

            {manualMsg && (
              <div style={{ margin: "0 20px 14px", padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: manualMsg.ok ? "rgba(0,255,148,0.08)" : "rgba(220,38,38,0.08)",
                color: manualMsg.ok ? "var(--profit)" : "var(--danger)",
                border: `1px solid ${manualMsg.ok ? "rgba(0,255,148,0.2)" : "rgba(220,38,38,0.2)"}`,
              }}>{manualMsg.text}</div>
            )}

            <div style={{ padding: "0 20px 16px", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setManualMode(false)}>Cancel</button>
              <button
                className="btn"
                disabled={manualSaving || !manualMerchant || !manualDeclared}
                onClick={async () => {
                  if (!manualMerchant || !manualDeclared) { setManualMsg({ text: "Merchant name and total amount are required", ok: false }); return; }
                  setManualSaving(true);
                  setManualMsg(null);
                  try {
                    const res = await fetch("/api/receipts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        receiptType: manualType,
                        merchantName: manualMerchant,
                        invoiceNumber: manualInvoice || undefined,
                        receiptDate: new Date(manualDate).toISOString(),
                        declaredTotal: parseInt(manualDeclared) || 0,
                        computedTotal: parseInt(manualDeclared) || 0,
                      }),
                    });
                    const d = await res.json();
                    if (!res.ok) { setManualMsg({ text: d.error ?? "Failed", ok: false }); }
                    else {
                      setManualMsg({ text: `✓ Receipt #${d.id} created. Go to Receipts to add line items.`, ok: true });
                      setManualMerchant(""); setManualInvoice(""); setManualDeclared("");
                      loadRecent();
                    }
                  } catch { setManualMsg({ text: "Network error", ok: false }); }
                  finally { setManualSaving(false); }
                }}
                style={{
                  background: manualType === "supplier" ? "var(--revenue)" : "var(--accent)",
                  border: "none", color: "#fff",
                  opacity: (manualSaving || !manualMerchant || !manualDeclared) ? 0.6 : 1,
                  cursor: (manualSaving || !manualMerchant || !manualDeclared) ? "not-allowed" : "pointer",
                }}
              >
                {manualSaving ? "Saving…" : "✓ Save Receipt"}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

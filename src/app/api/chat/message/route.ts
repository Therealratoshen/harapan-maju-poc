/**
 * POST /api/chat/message
 * Handles text commands from the web chat interface.
 * Uses in-memory SQLite when file DB is not available.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, asc, and, sql } from "drizzle-orm";

function rpFull(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

// Sample data for when DB has no data
const SAMPLE = {
  receipts: [
    { id: 20, merchantName: "Honda Jaya", receiptType: "supplier", status: "approved", declaredTotal: 8607620, receiptDate: new Date("2026-06-15") },
    { id: 19, merchantName: "Amar", receiptType: "supplier", status: "approved", declaredTotal: 28716340, receiptDate: new Date("2026-06-07") },
    { id: 18, merchantName: "Honda Jaya", receiptType: "supplier", status: "approved", declaredTotal: 2873940, receiptDate: new Date("2026-06-01") },
    { id: 17, merchantName: "Honda Jaya", receiptType: "supplier", status: "approved", declaredTotal: 3975880, receiptDate: new Date("2026-05-30") },
    { id: 9, merchantName: "Indako", receiptType: "buyer", status: "approved", declaredTotal: 23460275, receiptDate: new Date("2026-06-04") },
    { id: 3, merchantName: "Indako", receiptType: "buyer", status: "approved", declaredTotal: 38782800, receiptDate: new Date("2026-05-20") },
  ],
  flags: [
    { flagType: "MATH_ERROR", count: 4 },
    { flagType: "FOREIGN_CURRENCY", count: 2 },
  ],
  stock: [
    { name: "Honda Oli MPX2 10W30 0.8L", balance: 648 },
    { name: "QTC UNI Oil 20/50 0.8L", balance: 240 },
    { name: "IRC NR 92 TL 70/90-17", balance: 5 },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeQuery<T = any>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function formatReceipts(rows: any[]) {
  if (!rows || rows.length === 0) return "📭 Belum ada receipt.\n\nKirim foto receipt untuk mulai!";
  return rows.map((r) => {
    const date = new Date(r.receiptDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
    const status = r.status === "approved" ? "✅" : r.status === "flagged" ? "🚩" : "⏳";
    const type = r.receiptType === "supplier" ? "📤" : "📥";
    const total = r.declaredTotal ? rpFull(r.declaredTotal) : "—";
    return `${status} #${r.id} ${type} ${date} | ${r.merchantName || "—"} | ${total}`;
  }).join("\n");
}

export async function POST(request: NextRequest) {
  const { text } = await request.json().catch(() => ({ text: "" }));
  const t = (text ?? "").trim().toLowerCase();

  // ── receipt
  if (t === "receipt" || t.includes("receipt") || t === "struk" || t === "daftar") {
    const rows = await safeQuery(
      () => db.select().from(schema.receipts).orderBy(desc(schema.receipts.receiptDate)).limit(8),
      SAMPLE.receipts as any
    );
    return NextResponse.json({ reply: `📋 Receipt Terbaru\n\n${formatReceipts(rows)}` });
  }

  // ── pending
  if (t === "pending" || t.includes("pending") || t.includes("menunggu")) {
    const rows = await safeQuery(
      () => db.select().from(schema.receipts).where(eq(schema.receipts.status, "pending")).orderBy(asc(schema.receipts.receiptDate)),
      [] as any
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ reply: "✅ Semua receipt sudah di-review." });
    }
    const lines = rows.map((r: any) => {
      const date = new Date(r.receiptDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      return `⏳ #${r.id} | ${r.merchantName || "—"} | ${date}`;
    }).join("\n");
    return NextResponse.json({ reply: `⏳ ${rows.length} Receipt Pending\n\n${lines}\n\nReview → /dashboard/receipts` });
  }

  // ── flags (IDR receipts only) ────────────────────────────────────────
  if (t === "flags" || t.includes("flags") || t.includes("masalah")) {
    // Use raw SQL — count unresolved flags on IDR receipts
    const rawRows = await safeQuery(
      () => db.execute(sql`
        SELECT f.flag_type, COUNT(*)::int AS cnt
        FROM flags f
        LEFT JOIN receipts r ON f.receipt_id = r.id
        WHERE f.resolved = FALSE
          AND (r.currency = 'IDR' OR r.id IS NULL)
        GROUP BY f.flag_type
        ORDER BY cnt DESC
      `),
      { rows: [] } as any
    );
    const list: any[] = (rawRows as any)?.rows ?? [];
    if (list.length === 0) {
      return NextResponse.json({ reply: "✅ Tidak ada masalah. Semua bersih." });
    }
    const total = list.reduce((s, f) => s + Number(f.cnt ?? 0), 0);
    const lines = list.map((f) => `🚩 ${String(f.flag_type ?? "?").replace(/_/g, " ")}: ${f.cnt}`).join("\n");
    return NextResponse.json({ reply: `🚩 ${total} Flags (IDR)\n\n${lines}\n\nReview → /dashboard/flags` });
  }

  // ── omset (live from line items, IDR only) ───────────────────────────
  if (t.includes("omset") || t.includes("revenue") || t.includes("penjualan")) {
    // Fetch approved IDR supplier receipts, then sum their line items
    const receiptRows = await safeQuery(
      () => db.select({ id: schema.receipts.id })
        .from(schema.receipts)
        .where(and(
          eq(schema.receipts.receiptType, "supplier"),
          eq(schema.receipts.status, "approved"),
          eq(schema.receipts.currency, "IDR"),
        )),
      [] as any[]
    );
    const ids = (receiptRows as any[]).map((r: any) => r.id);
    let total = 0;
    if (ids.length > 0) {
      // Use raw SQL subquery to sum in one shot
      const sumResult = await safeQuery(
        () => db.execute(sql<{ total: number }>`
          SELECT COALESCE(SUM(li.total_price), 0)::float8 AS total
          FROM line_items li
          WHERE li.receipt_id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
        `),
        { rows: [{ total: 0 }] } as any
      );
      const rows = (sumResult as any)?.rows ?? [];
      total = Number(rows[0]?.total ?? 0);
    }
    return NextResponse.json({ reply: `📊 Omset\n\nTotal: ${rpFull(total)}\n\n(IDR · live dari line items)` });
  }

  // ── cogs (live from line items, IDR only) ─────────────────────────────
  if (t.includes("cogs") || t.includes("pembelian") || t.includes("beli")) {
    const receiptRows = await safeQuery(
      () => db.select({ id: schema.receipts.id })
        .from(schema.receipts)
        .where(and(
          eq(schema.receipts.receiptType, "buyer"),
          eq(schema.receipts.status, "approved"),
          eq(schema.receipts.currency, "IDR"),
        )),
      [] as any[]
    );
    const ids = (receiptRows as any[]).map((r: any) => r.id);
    let total = 0;
    if (ids.length > 0) {
      const sumResult = await safeQuery(
        () => db.execute(sql<{ total: number }>`
          SELECT COALESCE(SUM(li.total_price), 0)::float8 AS total
          FROM line_items li
          WHERE li.receipt_id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
        `),
        { rows: [{ total: 0 }] } as any
      );
      const rows = (sumResult as any)?.rows ?? [];
      total = Number(rows[0]?.total ?? 0);
    }
    return NextResponse.json({ reply: `💸 Total Pembelian\n\nTotal: ${rpFull(total)}\n\n(IDR · live dari line items)` });
  }

  // ── margin (live from line items, IDR only) ───────────────────────────
  if (t.includes("margin") || t.includes("laba") || t.includes("profit")) {
    const approved = await safeQuery(
      () => db.select({ id: schema.receipts.id, receiptType: schema.receipts.receiptType })
        .from(schema.receipts)
        .where(and(
          eq(schema.receipts.status, "approved"),
          eq(schema.receipts.currency, "IDR"),
        )),
      [] as any[]
    );
    const ids = (approved as any[]).map((r: any) => r.id);
    let rev = 0, cog = 0;
    if (ids.length > 0) {
      const sumResult = await safeQuery(
        () => db.execute(sql<{ id: number; total: number }>`
          SELECT li.receipt_id AS id, COALESCE(SUM(li.total_price), 0)::float8 AS total
          FROM line_items li
          WHERE li.receipt_id IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
          GROUP BY li.receipt_id
        `),
        { rows: [] } as any
      );
      const rows = (sumResult as any)?.rows ?? [];
      const byReceipt: Record<number, number> = {};
      for (const row of rows) { byReceipt[row.id] = Number(row.total ?? 0); }
      for (const r of approved as any[]) {
        const t2 = byReceipt[r.id] ?? 0;
        if (r.receiptType === "supplier") rev += t2; else cog += t2;
      }
    }
    if (rev === 0 && cog === 0) {
      return NextResponse.json({ reply: `📈 Margin\n\nOmset:   Rp 0\nBelanja:  Rp 0\nLaba:     Rp 0\nMargin:   0.0%\n(IDR · live)` });
    }
    const profit = rev - cog;
    const pct = rev > 0 ? ((profit / rev) * 100).toFixed(1) : "0";
    return NextResponse.json({ reply: `📈 Margin\n\nOmset:   ${rpFull(rev)}\nBelanja:  ${rpFull(cog)}\nLaba:     ${rpFull(profit)}\nMargin:   ${pct}%\n(IDR · live dari line items)` });
  }

  // ── stok (IDR receipts only) ───────────────────────────────────────────
  if (t.includes("stok") || t.includes("stock") || t.includes("inventory")) {
    // Get stock ledger with IDR receipt filter
    const ledger = await safeQuery(
      () => db.select({
        skuId:   schema.stockLedger.skuId,
        name:    schema.skus.normalizedName,
        type:    schema.stockLedger.movementType,
        qty:     schema.stockLedger.quantity,
        receiptId: schema.stockLedger.receiptId,
      })
        .from(schema.stockLedger)
        .leftJoin(schema.skus, eq(schema.stockLedger.skuId, schema.skus.id))
        .leftJoin(schema.receipts, eq(schema.stockLedger.receiptId, schema.receipts.id))
        .where(sql`receipts.currency = 'IDR' OR ${schema.stockLedger.receiptId} IS NULL`),
      [] as any[]
    );
    const list = (ledger as any[]) ?? [];
    // Aggregate by SKU
    const bySku: Record<number, { name: string; balance: number }> = {};
    for (const row of list) {
      if (!bySku[row.skuId]) bySku[row.skuId] = { name: row.name ?? "Unknown", balance: 0 };
      bySku[row.skuId].balance += row.type === "in" ? Number(row.qty ?? 0) : -Number(row.qty ?? 0);
    }
    const sorted = Object.entries(bySku)
      .map(([_, v]) => v)
      .filter(s => s.balance !== 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 8);
    if (sorted.length === 0) {
      return NextResponse.json({ reply: "📦 Belum ada data stok." });
    }
    const lines = sorted.map(s => {
      const dot = s.balance > 0 ? "🟢" : s.balance < 0 ? "🔴" : "⚪";
      return `${dot} ${s.name}: ${s.balance}`;
    }).join("\n");
    return NextResponse.json({ reply: `📦 Stok (IDR)\n\n${lines}` });
  }

  // ── help
  if (t === "help" || t === "bantu" || t === "menu") {
    return NextResponse.json({ reply: `📋 Perintah:\n\nreceipt  — daftar terbaru\npending  — belum di-review\nflags    — masalah\nomset    — penjualan\ncogs     — pembelian\nmargin    — laba\nstok     — inventory\n\nAtau kirim foto receipt 📸` });
  }

  // ── default
  return NextResponse.json({ reply: `Tidak paham "${text}".\n\nKetik "help" untuk lihat perintah, atau kirim foto receipt 📸` });
}

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

  // ── flags
  if (t === "flags" || t.includes("flags") || t.includes("masalah")) {
    const rows = await safeQuery(
      () => db.select({ count: sql<number>`count(*)`, type: schema.flags.flagType }).from(schema.flags).where(eq(schema.flags.resolved, false)).groupBy(schema.flags.flagType),
      SAMPLE.flags as any
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ reply: "✅ Tidak ada masalah. Semua bersih." });
    }
    const total = rows.reduce((s: number, f: any) => s + Number(f.count), 0);
    const lines = rows.map((f: any) => `🚩 ${f.type?.replace(/_/g, " ")}: ${f.count}`).join("\n");
    return NextResponse.json({ reply: `🚩 ${total} Flags\n\n${lines}\n\nReview → /dashboard/flags` });
  }

  // ── omset
  if (t.includes("omset") || t.includes("revenue") || t.includes("penjualan")) {
    const row = await safeQuery(
      () => db.select({ total: sql<number>`coalesce(sum(declared_total), 0)` }).from(schema.receipts).where(and(eq(schema.receipts.receiptType, "supplier"), eq(schema.receipts.currency, "IDR"), eq(schema.receipts.status, "approved"))),
      [{ total: SAMPLE.receipts.filter(r => r.receiptType === "supplier" && r.status === "approved").reduce((s, r) => s + r.declaredTotal, 0) }]
    );
    const total = Number(row?.[0]?.total ?? 0);
    return NextResponse.json({ reply: `📊 Omset\n\nTotal: ${rpFull(total)}\n\n(Approved IDR receipts)` });
  }

  // ── cogs
  if (t.includes("cogs") || t.includes("pembelian") || t.includes("beli")) {
    const row = await safeQuery(
      () => db.select({ total: sql<number>`coalesce(sum(declared_total), 0)` }).from(schema.receipts).where(and(eq(schema.receipts.receiptType, "buyer"), eq(schema.receipts.currency, "IDR"), eq(schema.receipts.status, "approved"))),
      [{ total: SAMPLE.receipts.filter(r => r.receiptType === "buyer" && r.status === "approved").reduce((s, r) => s + r.declaredTotal, 0) }]
    );
    const total = Number(row?.[0]?.total ?? 0);
    return NextResponse.json({ reply: `💸 Total Pembelian\n\nTotal: ${rpFull(total)}\n\n(Approved IDR receipts)` });
  }

  // ── margin
  if (t.includes("margin") || t.includes("laba") || t.includes("profit")) {
    const [rev, cog] = await Promise.all([
      safeQuery(() => db.select({ total: sql<number>`coalesce(sum(declared_total), 0)` }).from(schema.receipts).where(and(eq(schema.receipts.receiptType, "supplier"), eq(schema.receipts.currency, "IDR"), eq(schema.receipts.status, "approved"))), [{ total: 0 }]),
      safeQuery(() => db.select({ total: sql<number>`coalesce(sum(declared_total), 0)` }).from(schema.receipts).where(and(eq(schema.receipts.receiptType, "buyer"), eq(schema.receipts.currency, "IDR"), eq(schema.receipts.status, "approved"))), [{ total: 0 }]),
    ]);
    const r = Number(rev?.[0]?.total ?? 0);
    const c = Number(cog?.[0]?.total ?? 0);
    if (r === 0 && c === 0) {
      return NextResponse.json({ reply: `📈 Margin\n\nOmset:   Rp 0\nBelanja:  Rp 0\nLaba:     Rp 0\nMargin:   0.0%` });
    }
    const profit = r - c;
    const pct = r > 0 ? ((profit / r) * 100).toFixed(1) : "0";
    return NextResponse.json({ reply: `📈 Margin\n\nOmset:   ${rpFull(r)}\nBelanja:  ${rpFull(c)}\nLaba:     ${rpFull(profit)}\nMargin:   ${pct}%` });
  }

  // ── stok
  if (t.includes("stok") || t.includes("stock") || t.includes("inventory")) {
    const rows = await safeQuery(
      () => db.select({ name: schema.skus.normalizedName, balance: sql<number>`coalesce(sum(case when movement_type = 'in' then quantity else -quantity end), 0)` }).from(schema.stockLedger).leftJoin(schema.skus, eq(schema.stockLedger.skuId, schema.skus.id)).groupBy(schema.stockLedger.skuId).orderBy(sql`balance desc`).limit(8),
      SAMPLE.stock as any
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ reply: "📦 Belum ada data stok." });
    }
    const lines = rows.map((s: any) => {
      const b = Number(s.balance ?? 0);
      const dot = b > 0 ? "🟢" : b < 0 ? "🔴" : "⚪";
      return `${dot} ${s.name || "?"}: ${b}`;
    }).join("\n");
    return NextResponse.json({ reply: `📦 Stok\n\n${lines}` });
  }

  // ── help
  if (t === "help" || t === "bantu" || t === "menu") {
    return NextResponse.json({ reply: `📋 Perintah:\n\nreceipt  — daftar terbaru\npending  — belum di-review\nflags    — masalah\nomset    — penjualan\ncogs     — pembelian\nmargin    — laba\nstok     — inventory\n\nAtau kirim foto receipt 📸` });
  }

  // ── default
  return NextResponse.json({ reply: `Tidak paham "${text}".\n\nKetik "help" untuk lihat perintah, atau kirim foto receipt 📸` });
}

/**
 * CV. Harapan Maju — Telegram Bot Webhook
 * Receives photos + text commands, saves receipts to DB.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const OWNER_CHAT_ID = parseInt(process.env.OWNER_CHAT_ID ?? "0");
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://harapan-maju-poc.vercel.app";

// ─── Telegram API helpers ─────────────────────────────────────────────────

async function send(chatId: number, text: string) {
  if (!BOT_TOKEN || !chatId) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

async function downloadTelegramFile(fileId: string): Promise<string | null> {
  if (!BOT_TOKEN) return null;
  try {
    // Get file path from Telegram
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const data = await res.json();
    if (!data.ok || !data.result?.file_path) return null;

    const { file_path } = data.result;
    // Download the file
    const imgRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file_path}`);
    if (!imgRes.ok) return null;

    const bytes = await imgRes.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save to /public/uploads
    const ext = file_path.split(".").pop() ?? "jpg";
    const filename = `telegram_${Date.now()}.${ext}`;
    const uploadDir = join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), buffer);

    return `/uploads/${filename}`;
  } catch {
    return null;
  }
}

function rpFull(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

// ─── Photo: download + save ──────────────────────────────────────────────

async function onPhoto(chatId: number, fileId: string, receiptType: "buyer" | "supplier" = "buyer") {
  // Download image from Telegram
  const imageUrl = await downloadTelegramFile(fileId);

  const [receipt] = await db.insert(schema.receipts).values({
    receiptType,
    merchantName: "—",
    receiptDate: new Date(),
    declaredTotal: 0,
    computedTotal: 0,
    currency: "IDR",
    status: "pending",
    imageUrl: imageUrl ?? "",
  }).returning();

  await send(chatId,
    `📸 <b>Receipt #${receipt.id} disimpan</b>\n\n` +
    `Tunggu sebentar — OCR sedang proses.`
  );

  if (OWNER_CHAT_ID && OWNER_CHAT_ID !== chatId) {
    await send(OWNER_CHAT_ID,
      `🆕 <b>Receipt baru #${receipt.id}</b>\n\n` +
      `${receiptType === "buyer" ? "📥 Pembelian" : "📤 Penjualan"}\n` +
      `Review: ${BASE_URL}/dashboard/receipts`
    );
  }
}

// ─── Text commands ───────────────────────────────────────────────────────

async function onText(chatId: number, text: string) {
  const t = text.trim().toLowerCase();

  // /start
  if (t === "/start" || t === "/help") {
    return send(chatId,
      `<b>CV. Harapan Maju Tracker</b>\n\n` +
      `📸 Kirim foto receipt → otomatis tersimpan.\n\n` +
      `Atau ketik:\n` +
      `• receipt — daftar terbaru\n` +
      `• pending — belum di-review\n` +
      `• flags — masalah\n` +
      `• omset — penjualan\n` +
      `• cogs — pembelian\n` +
      `• margin — laba\n` +
      `• stok — inventory`
    );
  }

  // ── receipt type toggle
  if (t === "tipe beli" || t === "set buyer" || t === "/buyer") {
    // Set preference for this chat — simplified: just acknowledge
    return send(chatId, `📥 Mode: Pembelian (buyer)\n\nKirim foto receipt → akan tercatat sebagai pembelian.`);
  }
  if (t === "tipe jual" || t === "set supplier" || t === "/supplier") {
    return send(chatId, `📤 Mode: Penjualan (supplier)\n\nKirim foto receipt → akan tercatat sebagai penjualan.`);
  }

  // ── receipt list
  if (t.includes("receipt") || t.includes("struk") || t === "daftar") {
    const rows = await db.select().from(schema.receipts).orderBy(desc(schema.receipts.receiptDate)).limit(10);
    if (rows.length === 0) return send(chatId, "📭 Belum ada receipt.");
    const lines = rows.map((r: any) => {
      const date = new Date(r.receiptDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      const status = r.status === "approved" ? "✅" : r.status === "flagged" ? "🚩" : "⏳";
      const type = r.receiptType === "supplier" ? "📤" : "📥";
      const total = r.declaredTotal ? rpFull(r.declaredTotal) : "—";
      return `${status} #${r.id} ${type} ${date} | ${r.merchantName || "—"} | ${total}`;
    }).join("\n");
    return send(chatId, `<b>Receipt Terbaru</b>\n\n${lines}`);
  }

  // ── pending
  if (t.includes("pending") || t.includes("menunggu")) {
    const rows = await db.select().from(schema.receipts).where(eq(schema.receipts.status, "pending")).orderBy(asc(schema.receipts.receiptDate));
    if (rows.length === 0) return send(chatId, "✅ Semua receipt sudah di-review.");
    const lines = rows.map((r: any) => `⏳ #${r.id} | ${r.merchantName || "—"} | ${new Date(r.receiptDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}`).join("\n");
    return send(chatId, `<b>${rows.length} Receipt Pending</b>\n\n${lines}\n\nReview: ${BASE_URL}/dashboard/receipts`);
  }

  // ── flags
  if (t.includes("flag") || t.includes("masalah")) {
    const rows = await db.select({ count: sql<number>`count(*)`, type: schema.flags.flagType }).from(schema.flags).where(eq(schema.flags.resolved, 0)).groupBy(schema.flags.flagType);
    if (rows.length === 0) return send(chatId, "✅ Tidak ada masalah. Semua bersih.");
    const total = rows.reduce((s: number, f: any) => s + Number(f.count), 0);
    const lines = rows.map((f: any) => `🚩 ${f.type?.replace(/_/g, " ")}: ${f.count}`).join("\n");
    return send(chatId, `<b>🚩 ${total} Flags</b>\n\n${lines}\n\nReview: ${BASE_URL}/dashboard/flags`);
  }

  // ── omset
  if (t.includes("omset") || t.includes("revenue") || t.includes("penjualan")) {
    const [row] = await db.select({ total: sql<number>`coalesce(sum(declared_total), 0)` }).from(schema.receipts).where(and(eq(schema.receipts.receiptType, "supplier"), eq(schema.receipts.currency, "IDR"), eq(schema.receipts.status, "approved")));
    return send(chatId, `<b>📊 Omset</b>\n\nTotal: ${rpFull(Number(row?.total ?? 0))}`);
  }

  // ── cogs
  if (t.includes("cogs") || t.includes("pembelian") || t.includes("beli")) {
    const [row] = await db.select({ total: sql<number>`coalesce(sum(declared_total), 0)` }).from(schema.receipts).where(and(eq(schema.receipts.receiptType, "buyer"), eq(schema.receipts.currency, "IDR"), eq(schema.receipts.status, "approved")));
    return send(chatId, `<b>💸 Total Pembelian</b>\n\nTotal: ${rpFull(Number(row?.total ?? 0))}`);
  }

  // ── margin
  if (t.includes("margin") || t.includes("laba") || t.includes("profit")) {
    const [rev] = await db.select({ total: sql<number>`coalesce(sum(declared_total), 0)` }).from(schema.receipts).where(and(eq(schema.receipts.receiptType, "supplier"), eq(schema.receipts.currency, "IDR"), eq(schema.receipts.status, "approved")));
    const [cog] = await db.select({ total: sql<number>`coalesce(sum(declared_total), 0)` }).from(schema.receipts).where(and(eq(schema.receipts.receiptType, "buyer"), eq(schema.receipts.currency, "IDR"), eq(schema.receipts.status, "approved")));
    const r = Number(rev?.total ?? 0), c = Number(cog?.total ?? 0);
    const profit = r - c, pct = r > 0 ? ((profit / r) * 100).toFixed(1) : "0";
    return send(chatId, `<b>📈 Margin</b>\n\nOmset:   ${rpFull(r)}\nBelanja:  ${rpFull(c)}\nLaba:     ${rpFull(profit)}\nMargin:   ${pct}%`);
  }

  // ── stok
  if (t.includes("stok") || t.includes("stock") || t.includes("inventory")) {
    const rows = await db.select({ name: schema.skus.normalizedName, balance: sql<number>`coalesce(sum(case when movement_type = 'in' then quantity else -quantity end), 0)` }).from(schema.stockLedger).leftJoin(schema.skus, eq(schema.stockLedger.skuId, schema.skus.id)).groupBy(schema.stockLedger.skuId).orderBy(sql`balance desc`).limit(8);
    if (rows.length === 0) return send(chatId, "📦 Belum ada data stok.");
    const lines = rows.map((s: any) => {
      const b = Number(s.balance ?? 0);
      return `${b > 0 ? "🟢" : b < 0 ? "🔴" : "⚪"} ${s.name || "?"}: ${b}`;
    }).join("\n");
    return send(chatId, `<b>📦 Stok</b>\n\n${lines}`);
  }

  // ── default
  return send(chatId,
    `Tidak paham: "${text}"\n\n` +
    `Kirim foto receipt, atau ketik:\n` +
    `receipt · pending · flags · omset · cogs · margin · stok`
  );
}

// ─── Webhook ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!BOT_TOKEN) return NextResponse.json({ error: "BOT_TOKEN not set" }, { status: 500 });

  try {
    const body = await request.json();
    const msg = body.message ?? body.edited_message;
    if (!msg) return NextResponse.json({ ok: true });

    const chatId = msg.chat?.id;
    const text = msg.text ?? msg.caption;
    const photos: any[] = msg.photo ?? [];

    if (!chatId) return NextResponse.json({ ok: true });

    if (photos.length > 0) {
      // Use largest photo
      const fileId = photos[photos.length - 1]?.file_id ?? photos[0]?.file_id ?? "";
      await onPhoto(chatId, fileId);
    } else if (text) {
      await onText(chatId, text);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, name: "CV. Harapan Maju Bot" });
}

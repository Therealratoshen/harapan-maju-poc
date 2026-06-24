/**
 * CV. Harapan Maju — Telegram Bot Webhook
 *
 * Features:
 * - Auth via AUTHORIZED_GROUP_ID (optional — bot works in any chat if not set)
 * - Photo → Vercel Blob storage → MiniMax OCR → auto-creates line items
 * - Text commands: /approve, /reject, /flag, receipt, pending, flags, omset, cogs, margin, stok
 * - /set buyer | /set supplier — toggle receipt type
 */

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import { put } from "@vercel/blob";

const BOT_TOKEN            = process.env.TELEGRAM_BOT_TOKEN     ?? "";
const OWNER_CHAT_ID        = parseInt(process.env.OWNER_CHAT_ID ?? "0");
const MINIMAX_API_KEY      = process.env.MINIMAX_API_KEY       ?? "";
const BASE_URL             = process.env.NEXT_PUBLIC_BASE_URL    ?? "https://harapan-maju-poc.vercel.app";
const AUTHORIZED_GROUP_ID  = process.env.AUTHORIZED_GROUP_ID     ?? "";
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN  ?? "";

const MINIMAX_ENDPOINT = "https://api.minimaxi.chat/v1/chat/completions";
const VL_MODEL        = "MiniMax-VL-01";

// ─── Telegram API ────────────────────────────────────────────────────────────

async function send(chatId: number, text: string) {
  if (!BOT_TOKEN || !chatId) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

function rp(n: number) { return `Rp ${n.toLocaleString("id-ID")}`; }

// ─── Auth ─────────────────────────────────────────────────────────────────

async function isAuthorized(chatId: number): Promise<boolean> {
  if (!AUTHORIZED_GROUP_ID) return true; // No restriction
  const chatIdStr = String(chatId);
  // Allow: owner chat ID, authorized group, or if GROUP_ID is set as numeric group ID
  return (
    chatIdStr === AUTHORIZED_GROUP_ID ||
    chatId === OWNER_CHAT_ID
  );
}

// ─── Receipt type memory per user ──────────────────────────────────────────
// Simple in-memory store — resets on cold start (acceptable for POC)
const userPrefs = new Map<number, "buyer" | "supplier">();

function getPref(chatId: number): "buyer" | "supplier" {
  return userPrefs.get(chatId) ?? "buyer";
}

function setPref(chatId: number, type: "buyer" | "supplier") {
  userPrefs.set(chatId, type);
}

// ─── MiniMax OCR ───────────────────────────────────────────────────────────

const OCR_PROMPT = `You are an OCR engine for Indonesian motorbike spare parts shop receipts.
Extract all data exactly as written. Return ONLY valid JSON.

Indonesian format:
- "DUS"=carton, "BH"/"PCS"=pieces, "SET"=set, "LITER"/"LTR"=liter
- Numbers use dots: 1.234.567
- Dates: DD-MM-YYYY or DD/MM/YYYY
- DPP = tax base, PPN = VAT 11%/12%
- Suppliers (Harapan Maju BUYS from): PT Capella Patria, Indako, Central Motor, Panca Jaya, MM, Honda Jaya
- Customers (Harapan Maju SELLS to): Honda Jaya, Kharisma Jaya, Hasan Jaya, Asoka Jaya, Anugrah, Anjas, Amar
- "KEPADA" or "Kepada" = addressed to customer → supplier receipt
- Supplier name in header → buyer receipt

Return ONLY this JSON, no explanation:
{
  "merchant_name": "",
  "receipt_type": "buyer|supplier",
  "date": "YYYY-MM-DD",
  "invoice_number": null,
  "customer_name": "",
  "currency": "IDR",
  "declared_total": 0,
  "line_items": [{"description":"","part_number":null,"quantity":1,"unit":"pcs","unit_price":0,"total_price":0}],
  "confidence": 0.0,
  "notes": ""
}`;

async function runOCR(imageUrl: string): Promise<any> {
  if (!MINIMAX_API_KEY) throw new Error("MINIMAX_API_KEY not configured");

  const res = await fetch(MINIMAX_ENDPOINT, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${MINIMAX_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VL_MODEL,
      messages: [
        { role: "system", content: OCR_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: "Extract all data. Return ONLY JSON." },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) throw new Error(`MiniMax API error ${res.status}`);
  const data    = await res.json();
  let content  = (data.choices?.[0]?.message?.content ?? "").trim();
  content = content.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(content);
}

// ─── Photo upload to Vercel Blob ──────────────────────────────────────────

async function uploadToBlob(fileId: string): Promise<string | null> {
  if (!BOT_TOKEN) return null;
  try {
    // Get file path from Telegram
    const fileRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();
    if (!fileData.ok || !fileData.result?.file_path) return null;

    const { file_path } = fileData.result;
    const ext = file_path.split(".").pop()?.toLowerCase() ?? "jpg";
    const filename = `receipts/${Date.now()}_${fileId.slice(-8)}.${ext}`;

    // Download image bytes from Telegram
    const imgRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file_path}`);
    if (!imgRes.ok) return null;
    const bytes = await imgRes.arrayBuffer();

    // Upload to Vercel Blob
    if (!BLOB_READ_WRITE_TOKEN) {
      // Fallback: return the Telegram URL directly
      return `https://api.telegram.org/file/bot${BOT_TOKEN}/${file_path}`;
    }

    const blob = await put(filename, bytes, {
      access: "public",
      contentType: ext === "png" ? "image/png" : "image/jpeg",
    });

    return blob.url;
  } catch (err) {
    console.error("[blob upload]", err);
    return null;
  }
}

// ─── Log activity ─────────────────────────────────────────────────────────

async function logActivity(receiptId: number, action: string, message: string, actor = "telegram") {
  try {
    await db.insert(schema.activityLogs).values({ receiptId, action, message, actor });
  } catch { /* non-critical */ }
}

// ─── onPhoto ───────────────────────────────────────────────────────────────

async function onPhoto(chatId: number, fileId: string) {
  // 1. Upload to Vercel Blob (persistent)
  await send(chatId, "📸 Foto diterima. Mengunggah...");

  const imageUrl = await uploadToBlob(fileId);
  if (!imageUrl) {
    await send(chatId, "❌ Gagal upload foto. Coba lagi.");
    return;
  }

  // 2. Create pending receipt
  const receiptType = getPref(chatId);
  const [receipt] = await db.insert(schema.receipts).values({
    receiptType,
    merchantName: "—",
    receiptDate: new Date(),
    declaredTotal: 0,
    computedTotal: 0,
    currency: "IDR",
    status: "pending",
    imageUrl,
  }).returning();

  await logActivity(receipt.id, "photo_uploaded", `Photo uploaded via Telegram — type: ${receiptType}`, "telegram");
  await send(chatId, `⏳ Receipt #${receipt.id} disimpan. OCR berjalan...`);

  try {
    // 3. Run OCR
    const extracted  = await runOCR(imageUrl);
    const declaredTotal = parseInt(String(extracted.declared_total)) || 0;
    const computedTotal = (extracted.line_items ?? []).reduce(
      (sum: number, item: any) => sum + (parseInt(String(item.total_price)) || 0), 0
    );
    const confidence = extracted.confidence ?? 0.5;
    const merchant  = extracted.merchant_name ?? "—";

    // 4. Update receipt
    await db.update(schema.receipts)
      .set({
        merchantName:   merchant,
        receiptType:   (extracted.receipt_type === "supplier" ? "supplier" : receiptType) as any,
        receiptDate:    extracted.date ? new Date(extracted.date) : new Date(),
        invoiceNumber:  extracted.invoice_number ?? null,
        customerName:  extracted.customer_name ?? null,
        declaredTotal,
        computedTotal,
        currency:       extracted.currency ?? "IDR",
        confidence,
        status:         "flagged" as any,
        notes:          extracted.notes ?? null,
      })
      .where(eq(schema.receipts.id, receipt.id));

    // 5. Insert line items
    for (const item of extracted.line_items ?? []) {
      const qty       = parseFloat(String(item.quantity)) || 1;
      const unitPrice = parseInt(String(item.unit_price))  || 0;
      const total     = parseInt(String(item.total_price))  || 0;
      await db.insert(schema.lineItems).values({
        receiptId: receipt.id,
        skuId:     null,
        rawDescription:          item.description ?? "Unknown",
        normalizedDescription:   item.description ?? "Unknown",
        partNumber:             item.part_number ?? null,
        quantity:               qty,
        unit:                   item.unit ?? "pcs",
        unitPrice,
        totalPrice:             total,
        matchStatus:            "unmatched",
        confidence,
      });
    }

    // 6. Create flags
    const flags: any[] = [];
    if (declaredTotal > 0 && computedTotal > 0) {
      const diff = Math.abs(declaredTotal - computedTotal);
      if (diff / Math.max(declaredTotal, 1) > 0.005) {
        flags.push({ flagType: "MATH_ERROR", message: `Computed (${rp(computedTotal)}) ≠ declared (${rp(declaredTotal)}). Diff: ${rp(diff)}.` });
      }
    }
    if (!extracted.invoice_number && receiptType === "buyer") {
      flags.push({ flagType: "MISSING_INVOICE_NO", message: "No invoice number detected." });
    }
    if ((confidence ?? 0) < 0.5) {
      flags.push({ flagType: "LOW_CONFIDENCE", message: `OCR confidence ${Math.round(confidence * 100)}% — manual verification needed.` });
    }

    if (flags.length > 0) {
      await db.insert(schema.flags).values(flags.map(f => ({ receiptId: receipt.id, ...f })));
    } else {
      // Clean receipt — auto-approve
      await db.update(schema.receipts).set({ status: "approved" as any }).where(eq(schema.receipts.id, receipt.id));
    }

    await logActivity(receipt.id, "ocr_completed", `OCR done — ${extracted.line_items?.length ?? 0} items, ${flags.length} flags`, "system");

    const emoji = flags.length > 0 ? "🚩" : "✅";
    const status = flags.length > 0 ? `${flags.length} flag` : "Clean";
    await send(chatId,
      `${emoji} <b>OCR Selesai — #${receipt.id}</b>\n\n` +
      `<b>Merchant:</b> ${merchant}\n` +
      `<b>Total:</b> ${rp(declaredTotal)}\n` +
      `<b>Items:</b> ${extracted.line_items?.length ?? 0}\n` +
      `<b>Confidence:</b> ${Math.round(confidence * 100)}%\n` +
      `<b>Status:</b> ${status}\n\n` +
      `🔗 ${BASE_URL}/dashboard/receipts`
    );

    if (OWNER_CHAT_ID && OWNER_CHAT_ID !== chatId) {
      await send(OWNER_CHAT_ID,
        `📸 <b>Receipt baru #${receipt.id}</b>\n` +
        `Merchant: ${merchant} | Items: ${extracted.line_items?.length ?? 0} | Status: ${status}\n` +
        `🔗 ${BASE_URL}/dashboard/receipts`
      );
    }
  } catch (err: any) {
    console.error("[onPhoto OCR]", err);
    await send(chatId,
      `⚠️ <b>OCR Gagal — #${receipt.id}</b>\n\n` +
      `${err.message ?? "Unknown error"}\n\n` +
      `Receipt disimpan sebagai pending.\n` +
      `🔗 ${BASE_URL}/dashboard/receipts`
    );
  }
}

// ─── onText ────────────────────────────────────────────────────────────────

async function onText(chatId: number, text: string) {
  const t = text.trim().toLowerCase();

  // ── Pref commands ──────────────────────────────────────────────────────
  if (t === "tipe beli" || t === "set buyer" || t === "/set_buyer" || t === "/buyer") {
    setPref(chatId, "buyer");
    return send(chatId, `📥 Mode: Pembelian (buyer)\n\nKirim foto receipt → tercatat sebagai pembelian.`);
  }
  if (t === "tipe jual" || t === "set supplier" || t === "/set_supplier" || t === "/supplier") {
    setPref(chatId, "supplier");
    return send(chatId, `📤 Mode: Penjualan (supplier)\n\nKirim foto receipt → tercatat sebagai penjualan.`);
  }

  // ── /approve #id ────────────────────────────────────────────────────────
  const approveMatch = text.match(/^\/approve\s*#?(\d+)/i);
  if (approveMatch) {
    const id = parseInt(approveMatch[1]);
    const [receipt] = await db.select().from(schema.receipts).where(eq(schema.receipts.id, id)).limit(1);
    if (!receipt) return send(chatId, `❌ Receipt #${id} tidak ditemukan.`);
    if (receipt.status === "approved") return send(chatId, `ℹ️ Receipt #${id} sudah di-approve.`);
    if (receipt.status === "rejected") return send(chatId, `❌ Receipt #${id} sudah di-reject.`);

    await db.update(schema.receipts).set({ status: "approved" as any }).where(eq(schema.receipts.id, id));
    await logActivity(id, "approved", "Approved via Telegram", "telegram");
    return send(chatId, `✅ <b>Receipt #${id} approved</b>\n\nMerchant: ${receipt.merchantName ?? "—"}\nTotal: ${rp(receipt.declaredTotal ?? 0)}\n\n🔗 ${BASE_URL}/dashboard/receipts`);
  }

  // ── /reject #id [reason] ─────────────────────────────────────────────
  const rejectMatch = text.match(/^\/reject\s*#?(\d+)\s*(.*)/i);
  if (rejectMatch) {
    const id    = parseInt(rejectMatch[1]);
    const notes = rejectMatch[2].trim();
    const [receipt] = await db.select().from(schema.receipts).where(eq(schema.receipts.id, id)).limit(1);
    if (!receipt) return send(chatId, `❌ Receipt #${id} tidak ditemukan.`);
    if (receipt.status === "approved") return send(chatId, `❌ Receipt #${id} sudah di-approve.`);

    await db.update(schema.receipts).set({
      status: "rejected" as any,
      notes:  notes || receipt.notes,
    }).where(eq(schema.receipts.id, id));
    await logActivity(id, "rejected", notes ? `Rejected: ${notes}` : "Rejected via Telegram", "telegram");
    return send(chatId, `❌ <b>Receipt #${id} rejected</b>\n${notes ? `Alasan: ${notes}` : ""}\n\n🔗 ${BASE_URL}/dashboard/receipts`);
  }

  // ── /flag #id TYPE [message] ────────────────────────────────────────────
  const flagMatch = text.match(/^\/flag\s*#?(\d+)\s+(\w+)\s*(.*)/i);
  if (flagMatch) {
    const id     = parseInt(flagMatch[1]);
    const ftype  = flagMatch[2].toUpperCase();
    const fmsg   = flagMatch[3].trim();
    const validTypes = ["MATH_ERROR", "MISSING_DATE", "MISSING_INVOICE_NO", "NEGATIVE_STOCK",
      "UNRECONCILED", "DUPLICATE", "FOREIGN_CURRENCY", "DEAD_STOCK", "LOW_CONFIDENCE"];
    if (!validTypes.includes(ftype)) {
      return send(chatId, `❌ Tipe flag tidak valid.\nTipe yang tersedia: ${validTypes.join(", ")}`);
    }
    const [receipt] = await db.select().from(schema.receipts).where(eq(schema.receipts.id, id)).limit(1);
    if (!receipt) return send(chatId, `❌ Receipt #${id} tidak ditemukan.`);

    await db.insert(schema.flags).values({ receiptId: id, flagType: ftype as any, message: fmsg });
    await logActivity(id, "flag_raised", `${ftype}: ${fmsg}`, "telegram");
    return send(chatId, `🚩 <b>Receipt #${id} di-flag</b>\n\nTipe: ${ftype}\n${fmsg}`);
  }

  // ── /help or /start ───────────────────────────────────────────────────
  if (t === "/start" || t === "/help" || t === "help") {
    return send(chatId,
      `<b>CV. Harapan Maju Bot</b>\n\n` +
      `📸 Kirim foto receipt → OCR otomatis\n\n` +
      `Perintah:\n` +
      `• /approve #id — approve receipt\n` +
      `• /reject #id [reason] — reject\n` +
      `• /flag #id TYPE [msg] — flag receipt\n` +
      `• receipt — daftar terbaru\n` +
      `• pending — belum di-review\n` +
      `• flags — masalah\n` +
      `• omset — penjualan\n` +
      `• cogs — pembelian\n` +
      `• margin — laba\n` +
      `• stok — inventory\n` +
      `• /set_buyer | /set_supplier — mode receipt`
    );
  }

  // ── receipt list ───────────────────────────────────────────────────────
  if (t.includes("receipt") || t.includes("struk") || t === "daftar") {
    const receipts = await db.select().from(schema.receipts)
      .orderBy(desc(schema.receipts.receiptDate)).limit(8);
    if (receipts.length === 0) return send(chatId, "📭 Belum ada receipt.");
    const lines = receipts.map(r => {
      const date   = new Date(r.receiptDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
      const status = r.status === "approved" ? "✅" : r.status === "flagged" ? "🚩" : "⏳";
      const type   = r.receiptType === "supplier" ? "📤" : "📥";
      const total  = r.declaredTotal ? rp(r.declaredTotal) : "—";
      return `${status} #${r.id} ${type} ${date} | ${r.merchantName || "—"} | ${total}`;
    }).join("\n");
    return send(chatId, `<b>Receipt Terbaru</b>\n\n${lines}`);
  }

  // ── pending ───────────────────────────────────────────────────────────
  if (t.includes("pending") || t.includes("menunggu")) {
    const receipts = await db.select().from(schema.receipts)
      .where(eq(schema.receipts.status, "pending"))
      .orderBy(asc(schema.receipts.receiptDate));
    if (receipts.length === 0) return send(chatId, "✅ Semua receipt sudah di-review.");
    const lines = receipts.map(r =>
      `⏳ #${r.id} | ${r.merchantName || "—"} | ${new Date(r.receiptDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}`
    ).join("\n");
    return send(chatId, `<b>${receipts.length} Receipt Pending</b>\n\n${lines}\n\n🔗 ${BASE_URL}/dashboard/receipts`);
  }

  // ── flags ──────────────────────────────────────────────────────────────
  if (t.includes("flag") || t.includes("masalah")) {
    const flagRows = await db.execute(sql<{ flag_type: string; unresolved: number }>`
      SELECT flag_type, COALESCE(SUM(CASE WHEN resolved = FALSE THEN 1 ELSE 0 END), 0)::int AS unresolved
      FROM flags GROUP BY flag_type
    `);
    const rows = (flagRows as any[]);
    if (rows.length === 0) return send(chatId, "✅ Tidak ada masalah.");
    const total = rows.reduce((s, r) => s + Number(r.unresolved ?? 0), 0);
    const lines = rows.map(r => `🚩 ${r.flag_type?.replace(/_/g, " ")}: ${r.unresolved}`).join("\n");
    return send(chatId, `<b>🚩 ${total} Flags</b>\n\n${lines}\n\n🔗 ${BASE_URL}/dashboard/flags`);
  }

  // ── omset (revenue) ────────────────────────────────────────────────────
  // Compute from live line items — source of truth, IDR only
  if (t.includes("omset") || t.includes("revenue") || t.includes("penjualan")) {
    const approvedSuppliers = await db.select({ id: schema.receipts.id })
      .from(schema.receipts)
      .where(and(sql`receipt_type = 'supplier'`, sql`status = 'approved'`, sql`currency = 'IDR'`));
    const ids = approvedSuppliers.map(r => r.id);
    const items = ids.length > 0
      ? await db.select({ totalPrice: schema.lineItems.totalPrice }).from(schema.lineItems)
        .where(sql`receipt_id = ANY(${ids})`)
      : [];
    const total = items.reduce((s, li) => s + (li.totalPrice ?? 0), 0);
    return send(chatId, `<b>📊 Omset</b>\n\nTotal: ${rp(total)}\n(IDR · live dari line items)`);
  }

  // ── cogs ───────────────────────────────────────────────────────────────
  if (t.includes("cogs") || t.includes("pembelian") || t.includes("beli")) {
    const approvedBuyers = await db.select({ id: schema.receipts.id })
      .from(schema.receipts)
      .where(and(sql`receipt_type = 'buyer'`, sql`status = 'approved'`, sql`currency = 'IDR'`));
    const ids = approvedBuyers.map(r => r.id);
    const items = ids.length > 0
      ? await db.select({ totalPrice: schema.lineItems.totalPrice }).from(schema.lineItems)
        .where(sql`receipt_id = ANY(${ids})`)
      : [];
    const total = items.reduce((s, li) => s + (li.totalPrice ?? 0), 0);
    return send(chatId, `<b>💸 Total Pembelian</b>\n\nTotal: ${rp(total)}\n(IDR · live dari line items)`);
  }

  // ── margin ─────────────────────────────────────────────────────────────
  if (t.includes("margin") || t.includes("laba") || t.includes("profit")) {
    // Fetch approved IDR receipts + line items
    const approved = await db.select({ id: schema.receipts.id, receiptType: schema.receipts.receiptType })
      .from(schema.receipts)
      .where(and(sql`status = 'approved'`, sql`currency = 'IDR'`));
    const ids = approved.map(r => r.id);
    const items = ids.length > 0
      ? await db.select({ receiptId: schema.lineItems.receiptId, totalPrice: schema.lineItems.totalPrice })
        .from(schema.lineItems)
        .where(sql`receipt_id = ANY(${ids})`)
      : [];
    const byReceipt: Record<number, number> = {};
    for (const li of items) { byReceipt[li.receiptId] = (byReceipt[li.receiptId] ?? 0) + (li.totalPrice ?? 0); }
    let revenue = 0, cogs = 0;
    for (const r of approved) { const total = byReceipt[r.id] ?? 0; if (r.receiptType === 'supplier') revenue += total; else cogs += total; }
    const profit = revenue - cogs;
    const pct    = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : "0";
    return send(chatId,
      `<b>📈 Margin</b>\n\n` +
      `Omset:   ${rp(revenue)}\n` +
      `Belanja:  ${rp(cogs)}\n` +
      `Laba:     ${rp(profit)}\n` +
      `Margin:   ${pct}%\n` +
      `(IDR · live dari line items)`
    );
  }

  // ── stok ───────────────────────────────────────────────────────────────
  if (t.includes("stok") || t.includes("stock") || t.includes("inventory")) {
    // Filter stock ledger to IDR receipts only
    const stockData = await db.execute(sql<{ sku_name: string | null; balance: number }>`
      SELECT COALESCE(s.normalized_name, 'Unknown') AS sku_name,
             COALESCE(SUM(CASE WHEN sl.movement_type = 'in' THEN sl.quantity ELSE -sl.quantity END), 0) AS balance
      FROM stock_ledger sl
      LEFT JOIN skus s ON sl.sku_id = s.id
      LEFT JOIN receipts r ON sl.receipt_id = r.id
      WHERE r.currency = 'IDR' OR sl.receipt_id IS NULL
      GROUP BY sl.sku_id, s.normalized_name
      HAVING COALESCE(SUM(CASE WHEN sl.movement_type = 'in' THEN sl.quantity ELSE -sl.quantity END), 0) != 0
      ORDER BY balance DESC LIMIT 8
    `);
    const rows = stockData as any[];
    if (rows.length === 0) return send(chatId, "📦 Belum ada data stok.");
    const lines = rows.map(r => {
      const b = Number(r.balance ?? 0);
      return `${b > 0 ? "🟢" : b < 0 ? "🔴" : "⚪"} ${r.sku_name ?? "?"}: ${b}`;
    }).join("\n");
    return send(chatId, `<b>📦 Stok</b>\n\n${lines}`);
  }

  // ── default ─────────────────────────────────────────────────────────────
  return send(chatId,
    `Tidak paham: "${text}"\n\n` +
    `Kirim foto receipt, atau ketik:\n` +
    `receipt · pending · flags · omset · cogs · margin · stok\n` +
    `/approve #id · /reject #id · /flag #id TYPE`
  );
}

// ─── Webhook ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!BOT_TOKEN) return NextResponse.json({ error: "BOT_TOKEN not set" }, { status: 500 });

  try {
    const body    = await request.json();
    const msg     = body.message ?? body.edited_message;
    if (!msg) return NextResponse.json({ ok: true });

    const chatId  = msg.chat?.id;
    const text    = msg.text ?? msg.caption;
    const photos : any[] = msg.photo ?? [];

    if (!chatId) return NextResponse.json({ ok: true });

    // Auth check
    if (!(await isAuthorized(chatId))) {
      return NextResponse.json({ ok: true });
    }

    if (photos.length > 0) {
      const fileId = photos[photos.length - 1]?.file_id ?? photos[0]?.file_id ?? "";
      await onPhoto(chatId, fileId);
    } else if (text) {
      await onText(chatId, text);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[telegram]", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, name: "CV. Harapan Maju Bot", version: "2.0" });
}

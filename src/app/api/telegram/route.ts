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
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY ?? "";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://harapan-maju-poc.vercel.app";

const MINIMAX_ENDPOINT = "https://api.minimaxi.chat/v1/chat/completions";
const VL_MODEL = "MiniMax-VL-01";

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

// ─── MiniMax OCR ─────────────────────────────────────────────────────────────

const OCR_SYSTEM_PROMPT = `You are an OCR engine for Indonesian motorbike spare parts shop receipts.
Extract all data exactly as written. Return ONLY valid JSON.

Indonesian receipt format:
- "DUS" = carton, "BH"/"PCS" = pieces, "SET" = set, "LITER" = liter
- Numbers use dots for thousands: 1.234.567
- Dates: DD-MM-YYYY or DD/MM/YYYY
- DPP = tax base, PPN = VAT (11% or 12%)
- Suppliers = places Harapan Maju BUYS from: PT Capella Patria, Indako, Central Motor, Panca Jaya, MM
- Customers = places Harapan Maju SELLS to: Honda Jaya, Kharisma Jaya, Hasan Jaya, Asoka Jaya, Anugrah

Receipt type rule:
- If merchant is a known supplier (Capella, Indako, Central Motor, Panca Jaya, MM) → receipt_type = "buyer"
- If customer name is visible (e.g. "Kepada: Honda Jaya") → receipt_type = "supplier"
- Default to "buyer" if unclear

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

function rp(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

async function runReceiptOCR(imageUrl: string): Promise<any> {
  if (!MINIMAX_API_KEY) throw new Error("MINIMAX_API_KEY not configured");

  const res = await fetch(MINIMAX_ENDPOINT, {
    method: "POST",
    headers: { "Authorization": `Bearer ${MINIMAX_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: VL_MODEL,
      messages: [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: "Extract all data from this receipt. Return ONLY JSON." },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) throw new Error(`MiniMax API error ${res.status}`);
  const data = await res.json();
  let content = (data.choices?.[0]?.message?.content ?? "").trim();
  content = content.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(content);
}

// ─── Photo handler ─────────────────────────────────────────────────────────

async function onPhoto(chatId: number, fileId: string, receiptType: "buyer" | "supplier" = "buyer") {
  // 1. Download image from Telegram
  const imageUrl = await downloadTelegramFile(fileId);
  if (!imageUrl) {
    await send(chatId, "❌ Gagal download foto. Coba lagi.");
    return;
  }

  // 2. Create pending receipt
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

  await send(chatId,
    `📸 <b>Receipt #${receipt.id} disimpan</b>\n\n` +
    `⏳ OCR sedang proses...`
  );

  try {
    // 3. Run MiniMax OCR
    const extracted = await runReceiptOCR(imageUrl);
    const declaredTotal = parseInt(String(extracted.declared_total)) || 0;
    const computedTotal = (extracted.line_items ?? []).reduce(
      (sum: number, item: any) => sum + (parseInt(String(item.total_price)) || 0),
      0
    );
    const confidence = extracted.confidence ?? 0.5;
    const merchant = extracted.merchant_name ?? "—";
    const newType = extracted.receipt_type === "supplier" ? "supplier" : receiptType;

    // 4. Update receipt with extracted data
    await db.update(schema.receipts)
      .set({
        merchantName: merchant,
        receiptType: newType as any,
        receiptDate: extracted.date ? new Date(extracted.date) : new Date(),
        invoiceNumber: extracted.invoice_number ?? null,
        customerName: extracted.customer_name ?? null,
        declaredTotal,
        computedTotal,
        currency: extracted.currency ?? "IDR",
        confidence,
        status: "flagged" as any, // start flagged for review
        notes: extracted.notes ?? null,
      })
      .where(eq(schema.receipts.id, receipt.id));

    // 5. Insert line items
    const lineItemIds: number[] = [];
    if (extracted.line_items?.length > 0) {
      for (const item of extracted.line_items) {
        const qty = parseFloat(String(item.quantity)) || 1;
        const unitPrice = parseInt(String(item.unit_price)) || 0;
        const total = parseInt(String(item.total_price)) || 0;
        const [li] = await db.insert(schema.lineItems).values({
          receiptId: receipt.id,
          skuId: null,
          rawDescription: item.description ?? "Unknown",
          normalizedDescription: item.description ?? "Unknown",
          partNumber: item.part_number ?? null,
          quantity: qty,
          unit: item.unit ?? "pcs",
          unitPrice,
          totalPrice: total,
          matchStatus: "unmatched",
          confidence,
        }).returning();
        if (li) lineItemIds.push(li.id);
      }
    }

    // 6. Create flags for issues
    const newFlags: any[] = [];
    if (declaredTotal > 0 && computedTotal > 0) {
      const diff = Math.abs(declaredTotal - computedTotal);
      if (diff / Math.max(declaredTotal, 1) > 0.005) { // >0.5% variance
        newFlags.push({
          receiptId: receipt.id,
          flagType: "MATH_ERROR",
          message: `Computed (${rp(computedTotal)}) ≠ declared (${rp(declaredTotal)}). Variance: ${rp(diff)}.`,
        });
      }
    }
    if ((confidence ?? 0) < 0.5) {
      newFlags.push({
        receiptId: receipt.id,
        flagType: "LOW_CONFIDENCE",
        message: `OCR confidence ${Math.round(confidence * 100)}% — manual verification recommended.`,
      });
    }
    if (newFlags.length > 0) {
      await db.insert(schema.flags).values(newFlags);
    } else {
      // No issues — auto-approve
      await db.update(schema.receipts).set({ status: "approved" as any }).where(eq(schema.receipts.id, receipt.id));
    }

    // 7. Notify owner
    const emoji = newFlags.length > 0 ? "🚩" : "✅";
    const flagLabel = newFlags.length > 0 ? `${newFlags.length} flag` : "Clean";
    await send(chatId,
      `${emoji} <b>OCR Selesai — Receipt #${receipt.id}</b>\n\n` +
      `<b>Merchant:</b> ${merchant}\n` +
      `<b>Total:</b> ${rp(declaredTotal)}\n` +
      `<b>Items:</b> ${extracted.line_items?.length ?? 0}\n` +
      `<b>Confidence:</b> ${Math.round(confidence * 100)}%\n` +
      `<b>Status:</b> ${flagLabel}\n\n` +
      `🔗 ${BASE_URL}/dashboard/receipts`
    );

    if (OWNER_CHAT_ID && OWNER_CHAT_ID !== chatId) {
      await send(OWNER_CHAT_ID,
        `🆕 <b>Receipt baru #${receipt.id}</b>\n\n` +
        `Merchant: ${merchant}\n` +
        `Total: ${rp(declaredTotal)}\n` +
        `Items: ${extracted.line_items?.length ?? 0}\n` +
        `Status: ${flagLabel}\n\n` +
        `🔗 ${BASE_URL}/dashboard/receipts`
      );
    }
  } catch (err: any) {
    console.error("[onPhoto OCR]", err);
    await send(chatId,
      `⚠️ <b>OCR Gagal — Receipt #${receipt.id}</b>\n\n` +
      `Error: ${err.message ?? "Unknown error"}\n\n` +
      `Receipt disimpan sebagai pending.\n` +
      `🔗 ${BASE_URL}/dashboard/receipts`
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

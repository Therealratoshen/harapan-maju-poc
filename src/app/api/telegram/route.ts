/**
 * CV. Harapan Maju — Telegram Bot Webhook
 *
 * Features:
 * - Auth via AUTHORIZED_GROUP_ID (optional — bot works in any chat if not set)
 * - Photo → Vercel Blob storage → MiniMax OCR → auto-creates line items
 * - Conversational AI chat (MiniMax) — all text goes to AI with full business context
 * - OpenCLAW connects the bot to the dashboard for deeper integrations
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
        currency:       "IDR",
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

// ─── AI Chat Memory (per user, 10 msg each) ───────────────────────────────
const chatHistory = new Map<number, Array<{ role: string; content: string }>>();
const MAX_HISTORY = 10;

function getHistory(chatId: number) {
  return chatHistory.get(chatId) ?? [];
}

function addHistory(chatId: number, role: string, content: string) {
  const history = getHistory(chatId);
  history.push({ role, content });
  if (history.length > MAX_HISTORY) history.shift();
  chatHistory.set(chatId, history);
}

// ─── Build system context for AI ─────────────────────────────────────────

async function buildSystemContext(): Promise<string> {
  try {
    // Fetch live stats
    const [revRow] = await db.execute(sql<{ total: number }>`
      SELECT COALESCE(SUM(li.total_price), 0)::float8 AS total
      FROM line_items li JOIN receipts r ON li.receipt_id = r.id
      WHERE r.receipt_type = 'supplier' AND r.status = 'approved' AND r.currency = 'IDR'
    `);
    const [cogsRow] = await db.execute(sql<{ total: number }>`
      SELECT COALESCE(SUM(li.total_price), 0)::float8 AS total
      FROM line_items li JOIN receipts r ON li.receipt_id = r.id
      WHERE r.receipt_type = 'buyer' AND r.status = 'approved' AND r.currency = 'IDR'
    `);
    const [pendingRow] = await db.execute(sql<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM receipts WHERE currency = 'IDR' AND status IN ('pending','flagged')
    `);
    const [flagRow] = await db.execute(sql<{ count: number }>`
      SELECT COUNT(*)::int AS count FROM flags f
      LEFT JOIN receipts r ON f.receipt_id = r.id
      WHERE f.resolved = FALSE AND (r.currency = 'IDR' OR r.id IS NULL)
    `);
    const [stockRows] = await db.execute(sql<{ name: string | null; balance: number }>`
      SELECT COALESCE(s.normalized_name, 'Unknown') AS name,
             COALESCE(SUM(CASE WHEN sl.movement_type = 'in' THEN sl.quantity ELSE -sl.quantity END), 0) AS balance
      FROM stock_ledger sl LEFT JOIN skus s ON sl.sku_id = s.id
      LEFT JOIN receipts r ON sl.receipt_id = r.id
      WHERE r.currency = 'IDR' OR sl.receipt_id IS NULL
      GROUP BY sl.sku_id, s.normalized_name
      HAVING COALESCE(SUM(CASE WHEN sl.movement_type = 'in' THEN sl.quantity ELSE -sl.quantity END), 0) != 0
      ORDER BY balance DESC LIMIT 5
    `);

    const revenue = Number((revRow as any)?.total ?? 0);
    const cogs    = Number((cogsRow as any)?.total ?? 0);
    const pending = Number((pendingRow as any)?.count ?? 0);
    const flags   = Number((flagRow as any)?.count ?? 0);
    const stocks  = ((stockRows as unknown as any[]) ?? []).map((r: any) => `${r.name}: ${r.balance}`).join(", ");

    return `CURRENT BUSINESS STATE:
- Revenue (sales/omset): Rp ${revenue.toLocaleString("id-ID")}
- COGS (pembelian): Rp ${cogs.toLocaleString("id-ID")}
- Gross Profit: Rp ${(revenue - cogs).toLocaleString("id-ID")} (${revenue > 0 ? ((revenue - cogs) / revenue * 100).toFixed(1) : 0}% margin)
- Pending receipts: ${pending}
- Unresolved flags: ${flags}
- Top stock: ${stocks || "no data"}

CV. HARAPAN MAJU — Business Profile:
- Indonesian motorbike spare parts shop (sparepart motor)
- Located in Indonesia, transacts in IDR only
- Suppliers: PT Capella Patria, Indako, Central Motor, Panca Jaya, MM, Honda Jaya (buy from)
- Customers: Honda Jaya, Kharisma Jaya, Hasan Jaya, Asoka Jaya, Anugrah, Anjas, Amar (sell to)
- Common products: oli motor (engine oil), kampas rem (brake pads), ban (tires), spare parts
- All amounts in IDR. 1 USD ≈ 16,000 IDR

HOW TO HELP:
- Answer questions about the business, receipts, inventory, and financials
- Explain the numbers: why is COGS higher than revenue? What does it mean?
- Advise on pending receipts and flags
- Help with inventory management questions
- ALWAYS respond in Indonesian (Bahasa Indonesia) unless user writes in English
- Be conversational, helpful, and direct — like a smart business assistant
- If asked for specific numbers, use the CURRENT BUSINESS STATE above
- If asked about a specific receipt or item not in the state, say "Saya tidak punya data itu" and suggest checking the dashboard`;
  } catch {
    return `You are a helpful AI assistant for CV. Harapan Maju — an Indonesian motorbike spare parts shop.
Respond in Indonesian (Bahasa Indonesia) unless the user writes in English.
Be conversational, friendly, and informative about the business.`;
  }
}

// ─── AI Chat ────────────────────────────────────────────────────────────────

async function handleChat(chatId: number, userText: string): Promise<void> {
  const history = getHistory(chatId);
  const systemContext = await buildSystemContext();

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemContext },
    ...history,
    { role: "user", content: userText },
  ];

  try {
    const res = await fetch(MINIMAX_ENDPOINT, {
      method:  "POST",
      headers: { "Authorization": `Bearer ${MINIMAX_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "MiniMax-Text-01",
        messages,
        temperature: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      console.error("[chat] MiniMax error", res.status);
      return send(chatId, "Maaf, AI sedang sibuk. Coba lagi sebentar. 🙏");
    }

    const data    = await res.json();
    const reply   = (data.choices?.[0]?.message?.content ?? "").trim();

    if (!reply) {
      return send(chatId, "Maaf, saya tidak bisa menjawab saat ini. 🙏");
    }

    addHistory(chatId, "user", userText);
    addHistory(chatId, "assistant", reply);
    return send(chatId, reply);
  } catch (err) {
    console.error("[chat]", err);
    return send(chatId, "Maaf, terjadi kesalahan. Coba lagi. 🙏");
  }
}

async function onText(chatId: number, text: string) {
  // Everything goes to AI chat — no commands
  return handleChat(chatId, text);
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

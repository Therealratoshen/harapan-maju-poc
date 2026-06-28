/**
 * POST /api/receipts/[id]/process
 *
 * Runs MiniMax OCR on a receipt image, updates the receipt record,
 * auto-creates SKUs for new line items, creates flags, and notifies owner.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireApiKey } from "@/lib/auth";

const BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN     ?? "";
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY       ?? "";
const OWNER_CHAT_ID = parseInt(process.env.OWNER_CHAT_ID  ?? "0");

const MINIMAX_ENDPOINT = "https://api.minimaxi.chat/v1/chat/completions";
const VL_MODEL         = "MiniMax-VL-01";

// ─── Helpers ───────────────────────────────────────────────────────────────

async function getTelegramFileUrl(fileId: string): Promise<string | null> {
  if (!BOT_TOKEN) return null;
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const data = await res.json();
  if (!data.ok) return null;
  return `https://api.telegram.org/file/bot${BOT_TOKEN}/${data.result.file_path}`;
}

function rp(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

// ─── Category guesser ────────────────────────────────────────────────────────

function guessCategory(description: string): string {
  const d = (description ?? "").toLowerCase();
  if (/\b(oli|oil|matic|mesin|liter)\b/.test(d)) return "oil";
  if (/\b(ban|tire|tyre)\b/.test(d)) return "tire";
  if (/\b(rem|brake|piston|cakram|kampas)\b/.test(d)) return "brake";
  if (/\b(radiator|coolant|air\s*radiator)\b/.test(d)) return "coolant";
  if (/\b(spion|knalpot|lampu|bodi|body)\b/.test(d)) return "parts";
  return "uncategorized";
}

// ─── SKU upsert ─────────────────────────────────────────────────────────────
// Finds or creates a SKU for a given line item description, returns the SKU id.

async function upsertSkuForLineItem(
  rawDesc: string,
  normalizedDesc: string,
  partNumber: string | null,
  unitPrice: number,
): Promise<number> {
  // Try to find by part number first
  if (partNumber) {
    const byPart = await db
      .select()
      .from(schema.skus)
      .where(eq(schema.skus.partNumber, partNumber))
      .limit(1);
    if (byPart[0]) return byPart[0].id;
  }

  // Try to find by normalized name (contains match)
  const norm = (normalizedDesc ?? rawDesc).toLowerCase().trim();
  if (norm.length >= 4) {
    const allSkus = await db.select().from(schema.skus).limit(500);
    const match = allSkus.find(s =>
      s.normalizedName?.toLowerCase().includes(norm) ||
      norm.includes(s.normalizedName?.toLowerCase() ?? "")
    );
    if (match) return match.id;
  }

  // Create new SKU
  const [newSku] = await db.insert(schema.skus).values({
    normalizedName:  normalizedDesc || rawDesc || "Unknown Item",
    partNumber:     partNumber ?? null,
    category:        guessCategory(rawDesc),
    unit:            "pcs",
    purchasePriceAvg: unitPrice ?? 0,
  }).returning();

  return newSku.id;
}

// ─── Telegram notify ────────────────────────────────────────────────────────

async function notifyOwner(chatId: number, text: string) {
  if (!BOT_TOKEN || !chatId) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

// ─── MiniMax OCR ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an OCR engine for Indonesian motorbike parts shop receipts.
Extract all data exactly as written. Return ONLY valid JSON.

Indonesian receipt format notes:
- "DUS" = carton, "BH"/"PCS" = pieces, "SET" = set, "LITER" = liter
- Numbers use dots for thousands: 1.234.567
- Dates: DD-MM-YYYY or DD/MM/YYYY
- DPP = tax base, PPN = VAT (11% or 12%)
- Common merchants: PT Capella Patria, Indako, Central Motor, Panca Jaya, MM (suppliers = Harapan Maju buys from them)
- Common customers: Honda Jaya, Kharisma Jaya, Hasan Jaya, Asoka Jaya, Anugrah, Anjas, Amar

Receipt type rule:
- If receipt lists items CV. Harapan Maju purchased FROM a supplier → receipt_type = "buyer"
- If receipt lists items a customer purchased FROM CV. Harapan Maju → receipt_type = "supplier"
- If you see "KEPADA" (to/customer name) → supplier receipt
- If you see supplier company name as header → buyer receipt

Return ONLY this JSON, no explanation:
{
  "merchant_name": "",
  "receipt_type": "buyer|supplier",
  "date": "YYYY-MM-DD",
  "invoice_number": null,
  "customer_name": "",
  "currency": "IDR",
  "declared_total": 0,
  "subtotal": 0,
  "discount": 0,
  "tax_amount": 0,
  "line_items": [{"description":"","part_number":null,"quantity":1,"unit":"pcs","unit_price":0,"total_price":0}],
  "confidence": 0.0,
  "notes": ""
}`;

async function runOCR(imageUrl: string): Promise<any> {
  if (!MINIMAX_API_KEY) throw new Error("MINIMAX_API_KEY not configured");

  const res = await fetch(MINIMAX_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${MINIMAX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: VL_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
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

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MiniMax API error ${res.status}: ${text}`);
  }

  const data    = await res.json();
  let   content = (data.choices?.[0]?.message?.content ?? "").trim();

  // Strip markdown code fences
  content = content.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(content);
}

// ─── Main route ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const segments = url.pathname.split('/');
  const idIdx = segments.indexOf('receipts') + 1;
  const receiptId = parseInt(segments[idIdx] ?? '0');

  if (isNaN(receiptId) || receiptId === 0) {
    return NextResponse.json({ error: "Invalid receipt ID" }, { status: 400 });
  }

  try {
    // 1. Get receipt
    const [receipt] = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, receiptId))
      .limit(1);

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    if (receipt.status !== "pending") {
      return NextResponse.json({
        message: "Already processed",
        receipt,
      });
    }

    // 2. Resolve image URL
    const rawImageRef = receipt.imageUrl ?? "";
    let imageUrl = rawImageRef.startsWith("http")
      ? rawImageRef
      : await getTelegramFileUrl(rawImageRef);

    if (!imageUrl) {
      return NextResponse.json({ error: "Could not retrieve receipt image" }, { status: 500 });
    }

    // 3. Run OCR
    const extracted = await runOCR(imageUrl);

    // 4. Compute totals
    const computedTotal = (extracted.line_items ?? []).reduce(
      (sum: number, item: any) => sum + (parseInt(String(item.total_price)) || 0),
      0
    );

    const declaredTotal = parseInt(String(extracted.declared_total)) || 0;

    // 5. Update receipt
    await db.update(schema.receipts)
      .set({
        merchantName:    extracted.merchant_name   ?? receipt.merchantName,
        receiptType:    (extracted.receipt_type === "buyer" || extracted.receipt_type === "supplier")
                          ? extracted.receipt_type as "buyer" | "supplier"
                          : receipt.receiptType,
        receiptDate:     extracted.date ? new Date(extracted.date) : receipt.receiptDate,
        declaredTotal,
        computedTotal,
        invoiceNumber:  extracted.invoice_number  ?? null,
        customerName:   extracted.customer_name  ?? null,
        currency:       "IDR" as any,
        confidence:     extracted.confidence     ?? 0.5,
        notes:          extracted.notes           ?? null,
      })
      .where(eq(schema.receipts.id, receiptId));

    // 6. Replace line items
    if (extracted.line_items?.length > 0) {
      await db.delete(schema.lineItems)
        .where(eq(schema.lineItems.receiptId, receiptId));

      for (const item of extracted.line_items) {
        const qty       = parseFloat(String(item.quantity))       || 1;
        const unitPrice = parseInt(String(item.unit_price))         || 0;
        const total     = parseInt(String(item.total_price))        || 0;
        const desc      = item.description ?? "Unknown";
        const partNum   = item.part_number ?? null;

        // Auto-create SKU
        const skuId = await upsertSkuForLineItem(desc, desc, partNum, unitPrice);

        const [inserted] = await db.insert(schema.lineItems).values({
          receiptId,
          skuId,
          rawDescription:          desc,
          normalizedDescription:   desc,
          partNumber:             partNum,
          quantity:               qty,
          unit:                   item.unit ?? "pcs",
          unitPrice,
          totalPrice:             total,
          matchStatus:            "matched",
          confidence:             extracted.confidence ?? 0.5,
        }).returning();

        // Update line item with skuId
        if (inserted && skuId) {
          await db.update(schema.lineItems)
            .set({ skuId, matchStatus: "matched" })
            .where(eq(schema.lineItems.id, inserted.id));
        }
      }
    }

    // 7. Create flags
    const newFlags: any[] = [];

    if (declaredTotal > 0 && computedTotal > 0) {
      const diff = Math.abs(declaredTotal - computedTotal);
      if (diff / Math.max(declaredTotal, 1) > 0.01) { // >1% variance
        newFlags.push({
          receiptId,
          flagType:  "MATH_ERROR",
          message:  `Computed (${rp(computedTotal)}) ≠ declared (${rp(declaredTotal)}). Variance: ${rp(diff)} (${Math.round(diff / Math.max(declaredTotal, 1) * 100)}%).`,
        });
      }
    }

    // Note: currency is always IDR — foreign currency receipts are rejected at source

    if (!extracted.invoice_number && extracted.receipt_type === "buyer") {
      newFlags.push({ receiptId, flagType: "MISSING_INVOICE_NO", message: "No invoice number detected." });
    }

    if ((extracted.confidence ?? 0) < 0.5) {
      newFlags.push({
        receiptId,
        flagType:  "LOW_CONFIDENCE",
        message:  `OCR confidence ${Math.round((extracted.confidence ?? 0) * 100)}% — manual verification recommended.`,
      });
    }

    if (newFlags.length > 0) {
      await db.insert(schema.flags).values(newFlags);

      // Update receipt status to flagged
      await db.update(schema.receipts)
        .set({ status: "flagged" as any })
        .where(eq(schema.receipts.id, receiptId));
    }

    // 8. Notify owner
    if (OWNER_CHAT_ID) {
      const receiptType = extracted.receipt_type ?? receipt.receiptType;
      const merchant    = extracted.merchant_name ?? receipt.merchantName ?? "—";
      const confidence  = Math.round((extracted.confidence ?? 0) * 100);

      let msg = `✅ <b>OCR Complete — Receipt #${receiptId}</b>\n\n`;
      msg += `<b>Merchant:</b> ${merchant}\n`;
      msg += `<b>Type:</b> ${receiptType === "buyer" ? "📥 Pembelian" : "📤 Penjualan"}\n`;
      msg += `<b>Total:</b> ${rp(declaredTotal)}\n`;
      msg += `<b>Confidence:</b> ${confidence}%\n`;
      msg += `<b>Line items:</b> ${extracted.line_items?.length ?? 0}\n`;
      msg += newFlags.length > 0
        ? `\n🚩 <b>Flags:</b> ${newFlags.map(f => f.flagType.replace(/_/g, " ")).join(", ")}`
        : "\n✅ No flags";

      msg += `\n\n🔗 Review: https://harapan-maju-poc.vercel.app/dashboard/receipts`;
      await notifyOwner(OWNER_CHAT_ID, msg);
    }

    return NextResponse.json({
      ok:        true,
      receiptId,
      extracted,
      flags:     newFlags,
      skuCount:  extracted.line_items?.length ?? 0,
    });
  } catch (err: any) {
    console.error("OCR error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

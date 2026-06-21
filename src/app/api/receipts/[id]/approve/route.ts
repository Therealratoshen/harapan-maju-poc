/**
 * POST /api/receipts/[id]/approve
 *
 * Approves or rejects a receipt.
 * On approval: creates stock ledger entries, resolves flags, notifies via Telegram.
 */

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

const BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN     ?? "";
const OWNER_CHAT_ID = parseInt(process.env.OWNER_CHAT_ID  ?? "0");

function rp(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

// ─── Telegram notification ──────────────────────────────────────────────────

async function notifyApproval(receiptId: number, merchantName: string, declaredTotal: number, status: string) {
  if (!BOT_TOKEN || !OWNER_CHAT_ID) return;
  const emoji = status === "approved" ? "✅" : "❌";
  const label = status === "approved" ? "Approved" : "Rejected";

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id:   OWNER_CHAT_ID,
      text: `${emoji} <b>Receipt #${receiptId} — ${label}</b>\n\nMerchant: ${merchantName ?? "—"}\nTotal: ${rp(declaredTotal ?? 0)}\n\n🔗 https://harapan-maju-poc.vercel.app/dashboard/receipts`,
      parse_mode: "HTML",
    }),
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const receiptId = parseInt(id);

  if (isNaN(receiptId)) {
    return NextResponse.json({ error: "Invalid receipt ID" }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action ?? "approve";
    const note   = body.note   ?? "";

    // Fetch receipt
    const [receipt] = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, receiptId))
      .limit(1);

    if (!receipt) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    // Update receipt status
    await db
      .update(schema.receipts)
      .set({
        status: newStatus as any,
        notes:   note ? [receipt.notes, note].filter(Boolean).join(" | ") : receipt.notes,
      })
      .where(eq(schema.receipts.id, receiptId));

    // ── On APPROVAL: stock ledger + flags ─────────────────────────────────
    if (newStatus === "approved") {
      // Fetch all line items for this receipt
      const lineItems = await db
        .select()
        .from(schema.lineItems)
        .where(eq(schema.lineItems.receiptId, receiptId));

      // Get existing SKU ids from line items
      const skuIds = [...new Set(lineItems.map(li => li.skuId).filter(Boolean))];

      // Get current running balances for all relevant SKUs
      let existingBalances: Record<number, number> = {};
      if (skuIds.length > 0) {
        const allLedger = await db.select().from(schema.stockLedger);
        for (const entry of allLedger) {
          if (entry.skuId) {
            existingBalances[entry.skuId] = entry.runningBalance ?? 0;
          }
        }
      }

      // Insert stock ledger entries for buyer receipts (stock in)
      // For supplier receipts: stock out
      const movementType = receipt.receiptType === "buyer" ? "in" : "out";

      for (const item of lineItems) {
        if (!item.skuId) {
          // No SKU — skip stock ledger (item wasn't matched by OCR)
          continue;
        }

        const currentBalance = existingBalances[item.skuId] ?? 0;
        const delta = movementType === "in" ? item.quantity : -item.quantity;
        const newBalance = currentBalance + delta;

        await db.insert(schema.stockLedger).values({
          skuId:          item.skuId,
          receiptId,
          lineItemId:     item.id,
          movementType:   movementType as "in" | "out",
          quantity:       item.quantity,
          unitPrice:      item.unitPrice,
          runningBalance: newBalance,
          notes:          `Stock ${movementType} from receipt #${receiptId} (${receipt.receiptType})`,
        });

        existingBalances[item.skuId] = newBalance;
      }

      // Resolve all unresolved flags on this receipt
      await db
        .update(schema.flags)
        .set({
          resolved:   1,
          resolvedBy: "owner",
          resolvedAt: new Date(),
        })
        .where(eq(schema.flags.receiptId, receiptId));
    }

    // ── Notify via Telegram ─────────────────────────────────────────────────
    await notifyApproval(
      receiptId,
      receipt.merchantName ?? "",
      receipt.declaredTotal ?? 0,
      newStatus
    );

    return NextResponse.json({
      success:    true,
      receiptId,
      newStatus,
      message:    `Receipt ${action === "approve" ? "approved" : "rejected"} successfully`,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update receipt" }, { status: 500 });
  }
}

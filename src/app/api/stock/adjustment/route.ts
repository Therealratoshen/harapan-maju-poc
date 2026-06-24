/**
 * POST /api/stock/adjustment
 *
 * Create a manual stock movement (sale, return, correction).
 * Types:
 *   "out"        — sold / given out (decreases stock)
 *   "in"         — returned / correction add (increases stock)
 *   "adjustment" — inventory correction (can be + or -, use signed quantity)
 */

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { skuId, quantity, type, notes, unitPrice, customerName } = body;

    if (!skuId) return NextResponse.json({ error: "skuId is required" }, { status: 400 });
    if (!quantity || quantity <= 0) return NextResponse.json({ error: "quantity must be a positive number" }, { status: 400 });
    if (!type || !["in", "out", "adjustment"].includes(type)) {
      return NextResponse.json({ error: "type must be 'in', 'out', or 'adjustment'" }, { status: 400 });
    }

    const qty     = parseFloat(String(quantity));
    const uPrice  = parseInt(String(unitPrice)) || 0;

    // ── Get current running balance for this SKU ──────────
    const lastEntry = await db
      .select({ runningBalance: schema.stockLedger.runningBalance })
      .from(schema.stockLedger)
      .where(eq(schema.stockLedger.skuId, skuId))
      .orderBy(sql`id DESC`)
      .limit(1);

    const currentBalance = lastEntry.length > 0 ? (lastEntry[0].runningBalance ?? 0) : 0;
    const delta = type === "out" ? -qty : qty;
    const newBalance = Math.max(0, currentBalance + delta);

    // ── Warn if going negative ─────────────────────────────
    const wentNegative = newBalance === 0 && delta < 0 && (currentBalance + delta) < 0;

    // ── Insert ledger entry ────────────────────────────────
    const [entry] = await db.insert(schema.stockLedger).values({
      skuId,
      receiptId:    null,          // manual movement
      lineItemId:   null,
      movementType: type as "in" | "out",
      quantity:     qty,
      unitPrice:    uPrice,
      runningBalance: newBalance,
      notes: notes
        ? `[${type.toUpperCase()}] ${notes}${customerName ? ` · Pelanggan: ${customerName}` : ""}`
        : `[${type.toUpperCase()}] ${type === "out" ? "Penjualan / Penurunan stok" : "Koreksi stok"}`,
    }).returning();

    // ── Log activity ───────────────────────────────────────
    await db.insert(schema.activityLogs).values({
      action:  "stock_adjusted",
      message: `${type.toUpperCase()} ${qty} unit(s) · Notes: ${notes ?? "—"} · Pelanggan: ${customerName ?? "—"}`,
      actor:   "dashboard",
      receiptId: null,
    });

    return NextResponse.json({
      success:        true,
      entry:          { ...entry },
      previousBalance: currentBalance,
      newBalance,
      warning: wentNegative ? "Stock went negative — review entries" : null,
    });
  } catch (err) {
    console.error("[stock/adjustment]", err);
    return NextResponse.json({ error: "Failed to create stock adjustment" }, { status: 500 });
  }
}

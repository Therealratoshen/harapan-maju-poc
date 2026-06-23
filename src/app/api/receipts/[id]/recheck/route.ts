/**
 * POST /api/receipts/[id]/recheck
 *
 * Recalculates computed_total from all line items,
 * checks for MATH_ERROR / MISSING_INVOICE_NO flags,
 * auto-updates or removes flags accordingly.
 * Sets receipt status to "flagged" if new flags found, otherwise "pending".
 */

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import postgres from "postgres";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const receiptId = parseInt(id);
  if (!receiptId) return NextResponse.json({ error: "Invalid receipt ID" }, { status: 400 });

  try {
    // ── Fetch receipt ───────────────────────────────────
    const [receipt] = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, receiptId))
      .limit(1);

    if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

    // ── Sum line items ────────────────────────────────────
    const lineItems = await db
      .select()
      .from(schema.lineItems)
      .where(eq(schema.lineItems.receiptId, receiptId));

    const computedTotal = lineItems.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0);
    const declaredTotal = receipt.declaredTotal ?? 0;
    const variance     = Math.abs(declaredTotal - computedTotal);
    const variancePct  = computedTotal > 0 ? (variance / computedTotal) * 100 : 0;

    // ── Update computed_total ─────────────────────────────
    await db
      .update(schema.receipts)
      .set({ computedTotal } as any)
      .where(eq(schema.receipts.id, receiptId));

    // ── Detect MATH_ERROR ─────────────────────────────────
    const hasMathError = computedTotal > 0 && variancePct > 0.5;

    // ── Detect MISSING_INVOICE_NO ──────────────────────────
    const hasMissingInvoice = !receipt.invoiceNumber && receipt.receiptType === "buyer";

    // ── Fetch existing flags ───────────────────────────────
    const existingFlags = await db
      .select()
      .from(schema.flags)
      .where(eq(schema.flags.receiptId, receiptId));

    const existingMathFlag    = existingFlags.find(f => f.flagType === "MATH_ERROR");
    const existingInvoiceFlag = existingFlags.find(f => f.flagType === "MISSING_INVOICE_NO");

    // ── Upsert MATH_ERROR flag ────────────────────────────
    if (hasMathError && !existingMathFlag) {
      await db.insert(schema.flags).values({
        receiptId: receiptId,
        flagType:  "MATH_ERROR" as any,
        message:   `After edit: computed total (Rp ${computedTotal.toLocaleString("id-ID")}) ≠ declared (Rp ${declaredTotal.toLocaleString("id-ID")}). Variance: ${variancePct.toFixed(1)}%.`,
      });
    } else if (!hasMathError && existingMathFlag) {
      await db
        .update(schema.flags)
        .set({ resolved: true } as any)
        .where(eq(schema.flags.id, existingMathFlag.id));
    }

    // ── Upsert MISSING_INVOICE_NO flag ───────────────────
    if (hasMissingInvoice && !existingInvoiceFlag) {
      await db.insert(schema.flags).values({
        receiptId: receiptId,
        flagType:  "MISSING_INVOICE_NO" as any,
        message:   "No invoice number detected after editing.",
      });
    } else if (!hasMissingInvoice && existingInvoiceFlag) {
      await db
        .update(schema.flags)
        .set({ resolved: true } as any)
        .where(eq(schema.flags.id, existingInvoiceFlag.id));
    }

    // ── Count unresolved flags → update status ────────────
    const pg = postgres(process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "", { max: 1, ssl: { rejectUnauthorized: false } });
    const [countRow] = await pg`SELECT COUNT(*)::int AS cnt FROM flags WHERE receipt_id = ${receiptId} AND resolved = FALSE`;
    await pg.end();
    const unresolvedCount = (countRow as any)?.cnt ?? 0;
    const newStatus = unresolvedCount > 0 ? "flagged" : "pending";

    await db
      .update(schema.receipts)
      .set({ status: newStatus as any } as any)
      .where(eq(schema.receipts.id, receiptId));

    return NextResponse.json({
      success:        true,
      computedTotal,
      declaredTotal,
      variance,
      variancePct:    variancePct.toFixed(2),
      hasMathError,
      hasMissingInvoice,
      unresolvedFlags: unresolvedCount,
      newStatus,
    });
  } catch (err) {
    console.error("[receipts/recheck]", err);
    return NextResponse.json({ error: "Failed to recheck receipt" }, { status: 500 });
  }
}

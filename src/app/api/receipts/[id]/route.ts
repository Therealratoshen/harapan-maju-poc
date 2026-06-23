/**
 * PATCH /api/receipts/[id]
 * Update receipt metadata (merchantName, receiptDate, invoiceNumber, status, notes)
 */

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsedId = parseInt(id);
  if (!parsedId) return NextResponse.json({ error: "Invalid receipt ID" }, { status: 400 });

  try {
    const body = await request.json();
    const {
      merchantName,
      receiptDate,
      invoiceNumber,
      customerName,
      declaredTotal,
      computedTotal,
      notes,
      status,
    } = body;

    // Build only the fields that were provided
    const updates: Record<string, unknown> = {};
    if (merchantName  !== undefined) updates.merchantName   = merchantName;
    if (invoiceNumber !== undefined) updates.invoiceNumber  = invoiceNumber;
    if (customerName  !== undefined) updates.customerName   = customerName;
    if (declaredTotal !== undefined) updates.declaredTotal  = declaredTotal;
    if (computedTotal !== undefined) updates.computedTotal  = computedTotal;
    if (notes         !== undefined) updates.notes         = notes;
    if (status        !== undefined) updates.status         = status;

    if (receiptDate !== undefined) {
      updates.receiptDate = new Date(receiptDate);
    }

    const [updated] = await db
      .update(schema.receipts)
      .set(updates as any)
      .where(eq(schema.receipts.id, parsedId))
      .returning();

    if (!updated) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

    return NextResponse.json({ success: true, receipt: updated });
  } catch (err) {
    console.error("[receipts/patch]", err);
    return NextResponse.json({ error: "Failed to update receipt" }, { status: 500 });
  }
}

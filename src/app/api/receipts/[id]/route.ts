/**
 * GET  /api/receipts/[id] — fetch single receipt with line items + flags
 * PATCH /api/receipts/[id] — update receipt metadata
 * DELETE /api/receipts/[id] — delete receipt + cascade to line items + flags
 */

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireApiKey } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { id } = await params;
  const parsedId = parseInt(id);
  if (!parsedId) return NextResponse.json({ error: "Invalid receipt ID" }, { status: 400 });

  try {
    const [receipt] = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, parsedId));

    if (!receipt) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

    const lineItems = await db
      .select()
      .from(schema.lineItems)
      .where(eq(schema.lineItems.receiptId, parsedId));

    const flags = await db
      .select()
      .from(schema.flags)
      .where(eq(schema.flags.receiptId, parsedId));

    const computedTotal = lineItems.reduce((sum, li) => sum + (li.totalPrice ?? 0), 0);

    return NextResponse.json({ ...receipt, lineItems, flags, computedTotal });
  } catch (err) {
    console.error("[receipts/get]", err);
    return NextResponse.json({ error: "Failed to fetch receipt" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsedId = parseInt(id);
  const authErrorDel = requireApiKey(request);
  if (authErrorDel) return authErrorDel;

  if (!parsedId) return NextResponse.json({ error: "Invalid receipt ID" }, { status: 400 });

  try {
    // Cascade: delete line items + flags first
    await db.delete(schema.lineItems).where(eq(schema.lineItems.receiptId, parsedId));
    await db.delete(schema.flags).where(eq(schema.flags.receiptId, parsedId));
    // Also delete any stock ledger entries for this receipt
    await db.delete(schema.stockLedger).where(eq(schema.stockLedger.receiptId, parsedId));
    // Delete the receipt
    const [deleted] = await db
      .delete(schema.receipts)
      .where(eq(schema.receipts.id, parsedId))
      .returning();

    if (!deleted) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

    return NextResponse.json({ success: true, deleted: deleted.id });
  } catch (err) {
    console.error("[receipts/delete]", err);
    return NextResponse.json({ error: "Failed to delete receipt" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authErrorPatch = requireApiKey(request);
  if (authErrorPatch) return authErrorPatch;

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

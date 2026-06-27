/**
 * PUT  /api/receipts/[id]/line-items/[itemId]
 * DELETE /api/receipts/[id]/line-items/[itemId]
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireApiKey } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { itemId } = await params;
  const itemIdNum = parseInt(itemId);
  if (!itemIdNum) return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });

  try {
    const body = await request.json();
    const { description, quantity, unit, unitPrice, totalPrice, partNumber } = body;

    const qty    = parseFloat(String(quantity)) || 1;
    const uPrice = parseInt(String(unitPrice))  || 0;
    const tPrice = totalPrice !== undefined
                     ? parseInt(String(totalPrice))
                     : qty * uPrice;

    const [updated] = await db
      .update(schema.lineItems)
      .set({
        rawDescription:        description ?? "",
        normalizedDescription: description ?? "",
        quantity:              qty,
        unit:                  unit ?? "pcs",
        unitPrice:             uPrice,
        totalPrice:            tPrice,
        partNumber:            partNumber ?? null,
      } as any)
      .where(eq(schema.lineItems.id, itemIdNum))
      .returning();

    if (!updated) return NextResponse.json({ error: "Line item not found" }, { status: 404 });
    return NextResponse.json({ success: true, lineItem: updated });
  } catch (err) {
    console.error("[line-items/[itemId]/put]", err);
    return NextResponse.json({ error: "Failed to update line item" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { itemId } = await params;
  const itemIdNum = parseInt(itemId);
  if (!itemIdNum) return NextResponse.json({ error: "Invalid item ID" }, { status: 400 });

  try {
    await db.delete(schema.lineItems).where(eq(schema.lineItems.id, itemIdNum));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[line-items/[itemId]/delete]", err);
    return NextResponse.json({ error: "Failed to delete line item" }, { status: 500 });
  }
}
/**
 * DELETE /api/receipts/[id]/line-items/[itemId]
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
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

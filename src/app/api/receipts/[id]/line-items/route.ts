/**
 * GET  /api/receipts/[id]/line-items
 * POST /api/receipts/[id]/line-items
 */
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireApiKey } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  const { id } = await params;
  const receiptId = parseInt(id);
  if (!receiptId) return NextResponse.json({ error: "Invalid receipt ID" }, { status: 400 });

  try {
    const items = await db
      .select()
      .from(schema.lineItems)
      .where(eq(schema.lineItems.receiptId, receiptId))
      .orderBy(schema.lineItems.id);

    return NextResponse.json({ items });
  } catch (err) {
    console.error("[line-items/get]", err);
    return NextResponse.json({ error: "Failed to fetch line items" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  const { id } = await params;
  const receiptId = parseInt(id);
  if (!receiptId) return NextResponse.json({ error: "Invalid receipt ID" }, { status: 400 });

  try {
    const body = await request.json();
    const { description, quantity, unit, unitPrice, totalPrice, partNumber } = body;

    const qty    = parseFloat(String(quantity))  || 1;
    const uPrice = parseInt(String(unitPrice))   || 0;
    const tPrice = totalPrice !== undefined
                      ? parseInt(String(totalPrice))
                      : qty * uPrice;

    const [item] = await db.insert(schema.lineItems).values({
      receiptId:              receiptId,
      skuId:                  null,
      rawDescription:         description ?? "",
      normalizedDescription:  description ?? "",
      partNumber:             partNumber ?? null,
      quantity:               qty,
      unit:                   unit ?? "pcs",
      unitPrice:              uPrice,
      totalPrice:             tPrice,
      matchStatus:            "unmatched",
      confidence:             1.0,
    }).returning();

    return NextResponse.json({ success: true, lineItem: item });
  } catch (err) {
    console.error("[line-items/post]", err);
    return NextResponse.json({ error: "Failed to add line item" }, { status: 500 });
  }
}
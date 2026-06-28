/**
 * GET /api/stock/movements
 * Returns all stock ledger entries with SKU name, ordered newest first.
 * ?skuId=123  — filter by SKU
 * ?type=out   — filter by movement type (in | out | adjustment)
 */

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireApiKey } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const skuId = searchParams.get("skuId");
  const type   = searchParams.get("type");

  try {
    const conditions: any[] = [];

    if (skuId) conditions.push(eq(schema.stockLedger.skuId, parseInt(skuId)));
    if (type)  conditions.push(eq(schema.stockLedger.movementType, type));

    const movements = await db
      .select({
        id:            schema.stockLedger.id,
        skuId:         schema.stockLedger.skuId,
        productName:   schema.skus.normalizedName,
        unit:          schema.skus.unit,
        category:      schema.skus.category,
        receiptId:     schema.stockLedger.receiptId,
        movementType:  schema.stockLedger.movementType,
        quantity:      schema.stockLedger.quantity,
        unitPrice:     schema.stockLedger.unitPrice,
        runningBalance: schema.stockLedger.runningBalance,
        notes:         schema.stockLedger.notes,
        createdAt:     schema.stockLedger.createdAt,
      })
      .from(schema.stockLedger)
      .leftJoin(schema.skus, eq(schema.stockLedger.skuId, schema.skus.id))
      .leftJoin(schema.receipts, eq(schema.stockLedger.receiptId, schema.receipts.id))
      .where(conditions.length
        ? and(...conditions, sql`(receipts.currency = 'IDR' OR receipts.id IS NULL)`)
        : sql`(receipts.currency = 'IDR' OR receipts.id IS NULL)`)
      .orderBy(desc(schema.stockLedger.id));

    // Add source label
    const withSource = movements.map(m => ({
      ...m,
      source: m.receiptId ? "receipt" : "manual",
      isOut:  ["out", "adjustment"].includes(m.movementType ?? ""),
    }));

    // Summary stats
    const totalOut = movements
      .filter(m => ["out", "adjustment"].includes(m.movementType ?? ""))
      .reduce((sum, m) => sum + (m.quantity ?? 0), 0);
    const totalIn = movements
      .filter(m => m.movementType === "in")
      .reduce((sum, m) => sum + (m.quantity ?? 0), 0);

    return NextResponse.json({
      movements:    withSource,
      totalIn,
      totalOut,
      count:       movements.length,
    });
  } catch (err) {
    console.error("[stock/movements/get]", err);
    return NextResponse.json({ error: "Failed to fetch movements" }, { status: 500 });
  }
}

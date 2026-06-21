import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";

// GET /api/dashboard/stock
export async function GET() {
  try {
    // Get stock balance per SKU
    const stockData = await db
      .select({
        skuId: schema.stockLedger.skuId,
        skuName: schema.skus.normalizedName,
        partNumber: schema.skus.partNumber,
        category: schema.skus.category,
        unit: schema.skus.unit,
        inQty: sql<number>`SUM(CASE WHEN movement_type = 'in' THEN quantity ELSE 0 END)`,
        outQty: sql<number>`SUM(CASE WHEN movement_type = 'out' THEN quantity ELSE 0 END)`,
        stockValue: sql<number>`SUM(CASE WHEN movement_type = 'in' THEN quantity * unit_price ELSE 0 END)`,
      })
      .from(schema.stockLedger)
      .leftJoin(schema.skus, eq(schema.stockLedger.skuId, schema.skus.id))
      .groupBy(schema.stockLedger.skuId)
      .orderBy(schema.skus.normalizedName);

    const stock = stockData.map((row) => ({
      skuId: row.skuId,
      skuName: row.skuName ?? "Unknown",
      partNumber: row.partNumber,
      category: row.category ?? "uncategorized",
      unit: row.unit ?? "pcs",
      stockIn: Number(row.inQty),
      stockOut: Number(row.outQty),
      balance: Number(row.inQty) - Number(row.outQty),
      stockValue: Number(row.stockValue),
    }));

    // Current value = sum of (balance * avg unit price for remaining stock)
    const currentValue = stock.reduce((sum, s) => {
      if (s.balance <= 0 || s.stockIn === 0) return sum;
      const avgPrice = s.stockValue / s.stockIn;
      return sum + (s.balance * avgPrice);
    }, 0);

    // Get unreconciled line items count
    const unreconciledCount = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.lineItems)
      .where(eq(schema.lineItems.matchStatus, "unmatched"));

    return NextResponse.json({
      stock,
      currentValue: Math.round(currentValue),
      unreconciledCount: unreconciledCount[0]?.count ?? 0,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch stock" }, { status: 500 });
  }
}

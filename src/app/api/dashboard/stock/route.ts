import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { requireApiKey } from "@/lib/auth";

// GET /api/dashboard/stock
export async function GET(request: NextRequest) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  try {
    // Raw SQL to avoid drizzle GROUP BY column qualification issues
    const stockData = await db.execute(sql<{
      sku_id: number; normalized_name: string | null; part_number: string | null;
      category: string | null; unit: string | null;
      in_qty: number; out_qty: number; stock_value: number;
    }>`
      SELECT
        sl.sku_id,
        COALESCE(s.normalized_name, 'Unknown') as normalized_name,
        s.part_number,
        s.category,
        COALESCE(s.unit, 'pcs') as unit,
        COALESCE(SUM(CASE WHEN sl.movement_type = 'in' THEN sl.quantity ELSE 0 END), 0) as in_qty,
        COALESCE(SUM(CASE WHEN sl.movement_type = 'out' THEN sl.quantity ELSE 0 END), 0) as out_qty,
        COALESCE(SUM(CASE WHEN sl.movement_type = 'in' THEN sl.quantity * sl.unit_price ELSE 0 END), 0) as stock_value
      FROM stock_ledger sl
      LEFT JOIN skus s ON sl.sku_id = s.id
      GROUP BY sl.sku_id, s.normalized_name, s.part_number, s.category, s.unit
      ORDER BY sl.sku_id
    `);

    const stock = stockData.map((row) => {
      const inQty  = Number(row.in_qty  ?? 0);
      const outQty = Number(row.out_qty ?? 0);
      const sv     = Number(row.stock_value ?? 0);
      return {
        skuId:     row.sku_id,
        skuName:   row.normalized_name ?? "Unknown",
        partNumber: row.part_number,
        category:  row.category ?? "uncategorized",
        unit:      row.unit ?? "pcs",
        stockIn:   inQty,
        stockOut:  outQty,
        balance:   inQty - outQty,
        stockValue: sv,
      };
    });

    // Current value = sum of (balance * avg unit price for remaining stock)
    const currentValue = stock.reduce((sum, s) => {
      if (s.balance <= 0 || s.stockIn === 0) return sum;
      const avgPrice = s.stockValue / s.stockIn;
      return sum + (s.balance * avgPrice);
    }, 0);

    // Get unreconciled line items count
    const [unreconciledResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.lineItems)
      .where(eq(schema.lineItems.matchStatus, "unmatched"));

    return NextResponse.json({
      stock,
      currentValue: Math.round(currentValue),
      unreconciledCount: Number(unreconciledResult?.count ?? 0),
    });
  } catch (err: any) {
    console.error("[stock]", err?.message ?? err);
    return NextResponse.json({ error: "Failed to fetch stock", detail: err?.message }, { status: 500 });
  }
}

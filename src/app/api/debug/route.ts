import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { sql } from "drizzle-orm";
import { requireAdminApiKey } from "@/lib/auth";

// GET /api/debug — diagnose what's failing (admin only in production)
export async function GET(request: NextRequest) {
  const authError = await requireAdminApiKey(request);
  if (authError) return authError;

  const results: Record<string, unknown> = {};

  try {
    // Test 1: receipts table
    const receipts = await db.select({ count: sql<number>`count(*)` }).from(schema.receipts);
    results.receipts = { ok: true, count: receipts[0]?.count ?? 0 };
  } catch (err: any) {
    results.receipts = { ok: false, error: err.message };
  }

  try {
    // Test 2: line_items table
    const items = await db.select({ count: sql<number>`count(*)` }).from(schema.lineItems);
    results.lineItems = { ok: true, count: items[0]?.count ?? 0 };
  } catch (err: any) {
    results.lineItems = { ok: false, error: err.message };
  }

  try {
    // Test 3: flags table
    const flags = await db.select({ count: sql<number>`count(*)` }).from(schema.flags);
    results.flags = { ok: true, count: flags[0]?.count ?? 0 };
  } catch (err: any) {
    results.flags = { ok: false, error: err.message };
  }

  try {
    // Test 4: stock_ledger table
    const ledger = await db.select({ count: sql<number>`count(*)` }).from(schema.stockLedger);
    results.stockLedger = { ok: true, count: ledger[0]?.count ?? 0 };
  } catch (err: any) {
    results.stockLedger = { ok: false, error: err.message };
  }

  try {
    // Test 5: skus table
    const skus = await db.select({ count: sql<number>`count(*)` }).from(schema.skus);
    results.skus = { ok: true, count: skus[0]?.count ?? 0 };
  } catch (err: any) {
    results.skus = { ok: false, error: err.message };
  }

  try {
    // Test 6: flags with leftJoin (exact flags API query)
    const flags = await db
      .select({
        id: schema.flags.id,
        flagType: schema.flags.flagType,
        message: schema.flags.message,
      })
      .from(schema.flags)
      .leftJoin(schema.receipts, sql`${schema.flags.receiptId} = ${schema.receipts.id}`)
      .limit(5);
    results.flagsWithJoin = { ok: true, count: flags.length };
  } catch (err: any) {
    results.flagsWithJoin = { ok: false, error: err.message };
  }

  try {
    // Test 7: stock with leftJoin + groupBy (exact stock API query)
    const stock = await db
      .select({
        skuId: schema.stockLedger.skuId,
        skuName: schema.skus.normalizedName,
      })
      .from(schema.stockLedger)
      .leftJoin(schema.skus, sql`${schema.stockLedger.skuId} = ${schema.skus.id}`)
      .limit(5);
    results.stockWithJoin = { ok: true, count: stock.length };
  } catch (err: any) {
    results.stockWithJoin = { ok: false, error: err.message };
  }

  try {
    // Test 8: stock aggregation
    const agg = await db
      .select({
        skuId: schema.stockLedger.skuId,
        inQty: sql<number>`COALESCE(SUM(CASE WHEN movement_type = 'in' THEN quantity ELSE 0 END), 0)`,
      })
      .from(schema.stockLedger)
      .groupBy(schema.stockLedger.skuId)
      .limit(5);
    results.stockAggregation = { ok: true, count: agg.length };
  } catch (err: any) {
    results.stockAggregation = { ok: false, error: err.message };
  }

  return NextResponse.json(results);
}

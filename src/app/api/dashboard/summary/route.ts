import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import postgres from "postgres";

// Direct pg connection for raw SQL (avoids drizzle type issues)
function pg() {
  const connStr = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
  if (!connStr) throw new Error("POSTGRES_URL not set");
  return postgres(connStr, { max: 1, ssl: { rejectUnauthorized: false } });
}

function rows<T>(result: any): T[] {
  return Array.isArray(result) ? result : (result?.rows ?? []);
}

// GET /api/dashboard/summary
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  try {
    const baseApproved = [
      eq(schema.receipts.currency, "IDR"),
      eq(schema.receipts.status,   "approved"),
    ];
    const fromDate = from ? new Date(from) : null;
    const toDate   = to   ? new Date(to)   : null;
    if (fromDate) baseApproved.push(gte(schema.receipts.receiptDate, fromDate));
    if (toDate)   baseApproved.push(lte(schema.receipts.receiptDate, toDate));

    // ── Revenue & COGS ─────────────────────────────────
    const [revenueResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(declared_total), 0)` })
      .from(schema.receipts)
      .where(and(...baseApproved, eq(schema.receipts.receiptType, "supplier")));

    const [cogsResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(declared_total), 0)` })
      .from(schema.receipts)
      .where(and(...baseApproved, eq(schema.receipts.receiptType, "buyer")));

    // ── Counts ──────────────────────────────────────────
    const allIdrConditions: any[] = [eq(schema.receipts.currency, "IDR")];
    if (fromDate) allIdrConditions.push(gte(schema.receipts.receiptDate, fromDate));
    if (toDate)   allIdrConditions.push(lte(schema.receipts.receiptDate, toDate));

    const receiptCounts = await db
      .select({ type: schema.receipts.receiptType, count: sql<number>`COUNT(*)` })
      .from(schema.receipts)
      .where(and(...allIdrConditions))
      .groupBy(schema.receipts.receiptType);

    const pendingReceipts = (await pg().unsafe(`SELECT COUNT(*)::int AS count FROM receipts WHERE currency = 'IDR' AND status IN ('pending','flagged')`)) as any[];

    const flagCountResult = (await pg().unsafe(`SELECT COUNT(*)::int AS count FROM flags WHERE resolved = FALSE`)) as any[];

    // ── Monthly grouping ────────────────────────────────
    const allApproved = await db
      .select({
        receiptType:   schema.receipts.receiptType,
        declaredTotal: schema.receipts.declaredTotal,
        receiptDate:   schema.receipts.receiptDate,
      })
      .from(schema.receipts)
      .where(and(...baseApproved));

    const monthlyMap: Record<string, { month: string; revenue: number; cogs: number; profit: number }> = {};
    for (const r of allApproved) {
      const d    = new Date(r.receiptDate!);
      const key  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en", { month: "short", year: "numeric" });
      if (!monthlyMap[key]) monthlyMap[key] = { month: label, revenue: 0, cogs: 0, profit: 0 };
      if (r.receiptType === "supplier") monthlyMap[key].revenue += Number(r.declaredTotal);
      if (r.receiptType === "buyer")    monthlyMap[key].cogs    += Number(r.declaredTotal);
    }
    for (const m of Object.values(monthlyMap)) { m.profit = m.revenue - m.cogs; }
    const monthly = Object.values(monthlyMap).reverse();

    // ── COGS by Supplier (NEW) ─────────────────────────
    const cogsBySupplierRows = await db
      .select({
        supplier: schema.receipts.merchantName,
        total:    sql<number>`COALESCE(SUM(declared_total), 0)`,
      })
      .from(schema.receipts)
      .where(and(...baseApproved, eq(schema.receipts.receiptType, "buyer")))
      .groupBy(schema.receipts.merchantName)
      .orderBy(desc(sql`COALESCE(SUM(declared_total), 0)`))
      .limit(6);

    const cogsBySupplier = cogsBySupplierRows
      .filter(r => r.supplier)
      .map(r => ({ supplier: r.supplier, total: Number(r.total) }));

    // ── Recent receipts ────────────────────────────────
    const recentReceipts = await db
      .select()
      .from(schema.receipts)
      .where(and(...allIdrConditions))
      .orderBy(desc(schema.receipts.receiptDate))
      .limit(10);

    // ── Flag summary ───────────────────────────────────
    const flagSummaryRows = rows<{ flag_type: string; count: number }>(await pg().unsafe(`SELECT flag_type, COUNT(*)::int AS count FROM flags WHERE resolved = FALSE GROUP BY flag_type`));
    const flagSummary = flagSummaryRows.map(r => ({ flagType: r.flag_type, count: Number(r.count ?? 0) }));

    // ── Line items count ─────────────────────────────────
    const [{ lineItemCount }] = await db
      .select({ lineItemCount: sql<number>`COUNT(*)` })
      .from(schema.lineItems);

    // ── Top merchants (by approved supplier receipts) ────
    const topMerchantRows = rows<{ merchant_name: string | null; total_value: number; receipt_count: number }>(
      await pg().unsafe(`
        SELECT merchant_name,
               COALESCE(SUM(declared_total), 0)::int AS total_value,
               COUNT(*)::int AS receipt_count
        FROM receipts
        WHERE status = 'approved' AND receipt_type = 'supplier' AND merchant_name IS NOT NULL
        GROUP BY merchant_name
        ORDER BY total_value DESC
        LIMIT 6
      `)
    );
    const topMerchants = topMerchantRows.map(r => ({
      merchantName: r.merchant_name ?? "—",
      totalValue:   Number(r.total_value),
      receiptCount: Number(r.receipt_count),
    }));

    // ── Reconciliation alerts (flagged receipts with variance) ─
    const reconciliationRows = rows<{
      id: number; merchant_name: string | null; receipt_type: string; status: string;
      declared_total: number; computed_total: number; confidence: number;
      flag_type: string; flag_message: string;
    }>(await pg().unsafe(`
      SELECT r.id, r.merchant_name, r.receipt_type, r.status,
             r.declared_total, r.computed_total, r.confidence,
             f.flag_type, f.message AS flag_message
      FROM receipts r
      JOIN flags f ON f.receipt_id = r.id
      WHERE f.resolved = FALSE
        AND f.flag_type IN ('MATH_ERROR', 'MISSING_INVOICE_NO')
      ORDER BY ABS(r.declared_total - r.computed_total) DESC
      LIMIT 5
    `));
    const reconciliationAlerts = reconciliationRows.map(r => ({
      receiptId:       r.id,
      merchantName:    r.merchant_name ?? "—",
      receiptType:     r.receipt_type,
      status:         r.status,
      declaredTotal:   Number(r.declared_total),
      computedTotal:  Number(r.computed_total),
      variance:        Math.abs(Number(r.declared_total) - Number(r.computed_total)),
      variancePct:      Number(r.computed_total) > 0
                        ? Math.abs((Number(r.declared_total) - Number(r.computed_total)) / Number(r.computed_total) * 100).toFixed(1)
                        : "0",
      confidence:      Number(r.confidence),
      flagType:       r.flag_type,
      flagMessage:     r.flag_message,
    }));

    // ── Computed ────────────────────────────────────────
    const revenue    = Number(revenueResult?.total ?? 0);
    const cogsAmt   = Number(cogsResult?.total    ?? 0);
    const grossProfit = revenue - cogsAmt;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const buyerCount    = Number(receiptCounts.find(r => r.type === "buyer")?.count    ?? 0);
    const supplierCount = Number(receiptCounts.find(r => r.type === "supplier")?.count ?? 0);
    const pendingCount  = Number(pendingReceipts[0]?.count ?? 0);

    // Dynamic greeting
    const h = new Date().getHours();
    const greeting = h < 12 ? "Good morning" : h < 15 ? "Good afternoon" : "Good evening";

    return NextResponse.json({
      greeting,
      summary: {
        revenue,
        cogs: cogsAmt,
        grossProfit,
        grossMargin: Math.round(grossMargin * 10) / 10,
        buyerReceipts:    buyerCount,
        supplierReceipts: supplierCount,
        pendingFlags:     Number(flagCountResult[0]?.count ?? 0),
        totalReceipts:    buyerCount + supplierCount,
        pendingReceipts:  pendingCount,
        lineItemCount:    Number(lineItemCount ?? 0),
      },
      pendingCount,
      monthly,
      cogsBySupplier,
      recentReceipts,
      flagSummary,
      topMerchants,
      reconciliationAlerts,
    });
  } catch (err) {
    console.error("[summary]", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Failed to fetch summary", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

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

    // ── Revenue & COGS — computed live from line items (source of truth) ──
    // Fetch approved receipts + their line items and compute totals in JS
    const approvedReceipts = await db
      .select()
      .from(schema.receipts)
      .where(and(...baseApproved));
    const approvedReceiptIds = approvedReceipts.map(r => r.id);
    const allApprovedLineItems = approvedReceiptIds.length > 0
      ? await db.select().from(schema.lineItems)
      : [];

    // Build receiptId → computedTotal map
    const receiptComputedMap: Record<number, number> = {};
    for (const li of allApprovedLineItems) {
      if (!receiptComputedMap[li.receiptId]) receiptComputedMap[li.receiptId] = 0;
      receiptComputedMap[li.receiptId] += li.totalPrice ?? 0;
    }

    let revenue = 0, cogs = 0;
    for (const r of approvedReceipts) {
      if (r.currency !== "IDR") continue;
      const compTotal = receiptComputedMap[r.id] ?? 0;
      if (r.receiptType === "supplier") revenue += compTotal;
      if (r.receiptType === "buyer")    cogs    += compTotal;
    }

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

    const flagCountResult = (await pg().unsafe(`
      SELECT COUNT(*)::int AS count
      FROM flags f
      LEFT JOIN receipts r ON f.receipt_id = r.id
      WHERE f.resolved = FALSE AND (r.currency = 'IDR' OR r.id IS NULL)
    `)) as any[];

    // ── Monthly grouping ────────────────────────────────
    const allApproved = await db
      .select({
        receiptType:   schema.receipts.receiptType,
        declaredTotal: schema.receipts.declaredTotal,
        receiptDate:   schema.receipts.receiptDate,
        currency:      schema.receipts.currency,
        merchantName:  schema.receipts.merchantName,
        id:            schema.receipts.id,
      })
      .from(schema.receipts)
      .where(and(...baseApproved));

    const monthlyMap: Record<string, { month: string; revenue: number; cogs: number; profit: number }> = {};
    for (const r of allApproved) {
      if (r.currency !== "IDR") continue;
      const compTotal = receiptComputedMap[r.id] ?? 0;
      const d    = new Date(r.receiptDate!);
      const key  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en", { month: "short", year: "numeric" });
      if (!monthlyMap[key]) monthlyMap[key] = { month: label, revenue: 0, cogs: 0, profit: 0 };
      if (r.receiptType === "supplier") monthlyMap[key].revenue += compTotal;
      if (r.receiptType === "buyer")    monthlyMap[key].cogs    += compTotal;
    }
    for (const m of Object.values(monthlyMap)) { m.profit = m.revenue - m.cogs; }
    const monthly = Object.values(monthlyMap).reverse();

    // ── COGS by Supplier — computed from line items ────────
    const supplierMap: Record<string, number> = {};
    for (const r of allApproved) {
      if (r.currency !== "IDR" || r.receiptType !== "buyer") continue;
      const key = r.merchantName ?? "Unknown";
      supplierMap[key] = (supplierMap[key] ?? 0) + (receiptComputedMap[r.id] ?? 0);
    }
    const cogsBySupplier = Object.entries(supplierMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([supplier, total]) => ({ supplier, total }));

    // ── Recent receipts ────────────────────────────────
    const recentReceipts = await db
      .select()
      .from(schema.receipts)
      .where(and(...allIdrConditions))
      .orderBy(desc(schema.receipts.receiptDate))
      .limit(10);

    // ── Flag summary ───────────────────────────────────
    const flagSummaryRows = rows<{ flag_type: string; count: number }>(await pg().unsafe(`
      SELECT f.flag_type, COUNT(*)::int AS count
      FROM flags f
      LEFT JOIN receipts r ON f.receipt_id = r.id
      WHERE f.resolved = FALSE AND (r.currency = 'IDR' OR r.id IS NULL)
      GROUP BY f.flag_type
    `));
    const flagSummary = flagSummaryRows.map(r => ({ flagType: r.flag_type, count: Number(r.count ?? 0) }));

    // ── Line items count (IDR receipts only) ───────────────
    // Get all IDR receipt IDs (any status) so we count line items from all of them
    const allIdrReceiptIds = rows<{ id: number }>(
      await pg().unsafe(`SELECT id FROM receipts WHERE currency = 'IDR'`)
    ).map(r => r.id);

    const [{ lineItemCount }] = allIdrReceiptIds.length > 0
      ? await db
          .select({ lineItemCount: sql<number>`COUNT(*)` })
          .from(schema.lineItems)
          .where(sql`receipt_id IN (${sql.join(allIdrReceiptIds.map(id => sql`${id}`), sql`, `)})`)
      : [{ lineItemCount: 0 }];

    // ── Top merchants — computed from line items ─────────────────
    const merchantRevenueMap: Record<string, { totalValue: number; receiptCount: number }> = {};
    for (const r of allApproved) {
      if (r.currency !== "IDR" || r.receiptType !== "supplier") continue;
      const key = r.merchantName ?? "Unknown";
      if (!merchantRevenueMap[key]) merchantRevenueMap[key] = { totalValue: 0, receiptCount: 0 };
      merchantRevenueMap[key].totalValue   += receiptComputedMap[r.id] ?? 0;
      merchantRevenueMap[key].receiptCount += 1;
    }
    const topMerchants = Object.entries(merchantRevenueMap)
      .sort((a, b) => b[1].totalValue - a[1].totalValue)
      .slice(0, 6)
      .map(([merchantName, v]) => ({ merchantName, totalValue: v.totalValue, receiptCount: v.receiptCount }));

    // ── Reconciliation alerts (IDR, pending/flagged, with MATH_ERROR) ─
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
      WHERE r.currency = 'IDR'
        AND r.status IN ('pending', 'flagged')
        AND f.resolved = FALSE
        AND f.flag_type IN ('MATH_ERROR', 'MISSING_INVOICE_NO')
      ORDER BY ABS(r.declared_total - r.computed_total) DESC
      LIMIT 5
    `));
    // Only include receipts where at least one of declared/computed is non-zero
    const reconciliationAlerts = reconciliationRows
      .map(r => {
        const liveComputed = receiptComputedMap[r.id] ?? Number(r.computed_total);
        const variance    = Math.abs(Number(r.declared_total) - liveComputed);
        const variancePct = liveComputed > 0 ? Math.abs(variance / liveComputed * 100).toFixed(1) : "0";
        return {
          receiptId:    r.id,
          merchantName: r.merchant_name ?? "—",
          receiptType: r.receipt_type,
          status:      r.status,
          declaredTotal:  Number(r.declared_total),
          computedTotal: liveComputed,
          variance:     variance,
          variancePct:  variancePct,
          confidence:   Number(r.confidence),
          flagType:     r.flag_type,
          flagMessage:  r.flag_message,
        };
      })
      .filter(a => a.declaredTotal > 0 || a.computedTotal > 0);

    // ── Computed ────────────────────────────────────────
    const grossProfit = revenue - cogs;
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
        cogs: cogs,
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

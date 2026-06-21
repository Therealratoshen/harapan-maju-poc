import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

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

    const pendingReceipts = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.receipts)
      .where(and(...allIdrConditions, eq(schema.receipts.status, "pending")));

    const [flagCountResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.flags)
      .where(eq(schema.flags.resolved, 0));

    // ── Monthly grouping ────────────────────────────────
    const allApproved = await db
      .select({
        receiptType:   schema.receipts.receiptType,
        declaredTotal: schema.receipts.declaredTotal,
        receiptDate:   schema.receipts.receiptDate,
      })
      .from(schema.receipts)
      .where(and(...baseApproved));

    const monthlyMap: Record<string, { month: string; revenue: number; cogs: number }> = {};
    for (const r of allApproved) {
      const d   = new Date(r.receiptDate!);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en", { month: "short", year: "numeric" });
      if (!monthlyMap[key]) monthlyMap[key] = { month: label, revenue: 0, cogs: 0 };
      if (r.receiptType === "supplier") monthlyMap[key].revenue += Number(r.declaredTotal);
      if (r.receiptType === "buyer")    monthlyMap[key].cogs    += Number(r.declaredTotal);
    }
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
    const flagSummary = await db
      .select({
        flagType: schema.flags.flagType,
        count:    sql<number>`COUNT(*)`,
      })
      .from(schema.flags)
      .where(eq(schema.flags.resolved, 0))
      .groupBy(schema.flags.flagType);

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
        pendingFlags:     Number(flagCountResult?.count ?? 0),
        totalReceipts:    buyerCount + supplierCount,
        pendingReceipts:  pendingCount,
      },
      pendingCount,
      monthly,
      cogsBySupplier,
      recentReceipts,
      flagSummary,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}

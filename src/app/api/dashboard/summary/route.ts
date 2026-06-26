import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";

function pg() {
  const connStr = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
  if (!connStr) throw new Error("POSTGRES_URL not set");
  return postgres(connStr, { max: 1, ssl: { rejectUnauthorized: false } });
}

function rows<T>(result: any): T[] {
  return Array.isArray(result) ? result : (result?.rows ?? []);
}

export async function GET(request: NextRequest) {
  try {
    // ── Revenue & COGS — single join query, no ORM cold-start ──
    const revenueRows = rows<{ receipt_type: string; receipt_id: number; total: number }>(
      await pg().unsafe(`
        SELECT r.receipt_type, r.id AS receipt_id,
               COALESCE(SUM(li.total_price), 0)::float8 AS total
        FROM receipts r
        LEFT JOIN line_items li ON r.id = li.receipt_id
        WHERE r.currency = 'IDR' AND r.status = 'approved'
        GROUP BY r.receipt_type, r.id
      `)
    );
    const receiptComputedMap: Record<number, number> = {};
    let revenue = 0, cogs = 0;
    for (const row of revenueRows) {
      receiptComputedMap[row.receipt_id] = row.total;
      if (row.receipt_type === "supplier") revenue += row.total;
      if (row.receipt_type === "buyer")    cogs    += row.total;
    }

    // ── Counts ──────────────────────────────────────────
    const receiptCounts = rows<{ type: string; count: number }>(
      await pg().unsafe(`
        SELECT receipt_type AS type, COUNT(*)::int AS count
        FROM receipts WHERE currency = 'IDR'
        GROUP BY receipt_type
      `)
    );
    const pendingReceipts = rows<{ count: number }>(
      await pg().unsafe(`SELECT COUNT(*)::int AS count FROM receipts WHERE currency = 'IDR' AND status IN ('pending','flagged')`)
    );
    const flagCountResult = rows<{ count: number }>(
      await pg().unsafe(`
        SELECT COUNT(*)::int AS count FROM flags f
        LEFT JOIN receipts r ON f.receipt_id = r.id
        WHERE f.resolved = FALSE AND (r.currency = 'IDR' OR r.id IS NULL)
      `)
    );

    // ── Monthly grouping ────────────────────────────────
    const monthlyRows = rows<{ month: string; receipt_type: string; total: number }>(
      await pg().unsafe(`
        SELECT to_char(r.receipt_date, 'YYYY-MM') AS month,
               r.receipt_type,
               COALESCE(SUM(li.total_price), 0)::float8 AS total
        FROM receipts r
        LEFT JOIN line_items li ON r.id = li.receipt_id
        WHERE r.currency = 'IDR' AND r.status = 'approved'
        GROUP BY month, r.receipt_type
        ORDER BY month
      `)
    );
    const monthlyMap: Record<string, { month: string; revenue: number; cogs: number; profit: number }> = {};
    for (const row of monthlyRows) {
      const label = new Date(row.month + "-01").toLocaleDateString("en", { month: "short", year: "numeric" });
      if (!monthlyMap[row.month]) monthlyMap[row.month] = { month: label, revenue: 0, cogs: 0, profit: 0 };
      if (row.receipt_type === "supplier") monthlyMap[row.month].revenue += row.total;
      if (row.receipt_type === "buyer")    monthlyMap[row.month].cogs    += row.total;
    }
    for (const m of Object.values(monthlyMap)) { m.profit = m.revenue - m.cogs; }
    const monthly = Object.values(monthlyMap).reverse();

    // ── COGS by Supplier ───────────────────────────────
    const cogsSupplierRows = rows<{ merchant_name: string | null; total: number }>(
      await pg().unsafe(`
        SELECT r.merchant_name, COALESCE(SUM(li.total_price), 0)::float8 AS total
        FROM receipts r
        LEFT JOIN line_items li ON r.id = li.receipt_id
        WHERE r.currency = 'IDR' AND r.status = 'approved' AND r.receipt_type = 'buyer'
        GROUP BY r.merchant_name
        ORDER BY total DESC LIMIT 6
      `)
    );
    const cogsBySupplier = cogsSupplierRows.map(r => ({ supplier: r.merchant_name ?? "Unknown", total: r.total }));

    // ── Recent receipts ────────────────────────────────
    const recentReceipts = rows<{
      id: number; merchant_name: string | null; receipt_type: string; status: string;
      declared_total: number; computed_total: number; receipt_date: string; currency: string;
    }>(
      await pg().unsafe(`
        SELECT id, merchant_name, receipt_type, status,
               declared_total, computed_total, receipt_date::text, currency
        FROM receipts WHERE currency = 'IDR'
        ORDER BY receipt_date DESC LIMIT 10
      `)
    );

    // ── Flag summary ───────────────────────────────────
    const flagSummaryRows = rows<{ flag_type: string; count: number }>(
      await pg().unsafe(`
        SELECT f.flag_type, COUNT(*)::int AS count
        FROM flags f
        LEFT JOIN receipts r ON f.receipt_id = r.id
        WHERE f.resolved = FALSE AND (r.currency = 'IDR' OR r.id IS NULL)
        GROUP BY f.flag_type
      `)
    );
    const flagSummary = flagSummaryRows.map(r => ({ flagType: r.flag_type, count: Number(r.count ?? 0) }));

    // ── Line items count ──────────────────────────────
    const liCountRows = rows<{ count: number }>(
      await pg().unsafe(`
        SELECT COUNT(*)::int AS count FROM line_items li
        JOIN receipts r ON li.receipt_id = r.id
        WHERE r.currency = 'IDR'
      `)
    );
    const lineItemCount = Number(liCountRows[0]?.count ?? 0);

    // ── Top merchants ────────────────────────────────
    const topMerchantRows = rows<{ merchant_name: string | null; total_value: number; receipt_count: number }>(
      await pg().unsafe(`
        SELECT r.merchant_name,
               COALESCE(SUM(li.total_price), 0)::float8 AS total_value,
               COUNT(DISTINCT r.id)::int AS receipt_count
        FROM receipts r
        LEFT JOIN line_items li ON r.id = li.receipt_id
        WHERE r.currency = 'IDR' AND r.status = 'approved' AND r.receipt_type = 'supplier'
        GROUP BY r.merchant_name
        ORDER BY total_value DESC LIMIT 6
      `)
    );
    const topMerchants = topMerchantRows.map(r => ({
      merchantName: r.merchant_name ?? "Unknown",
      totalValue:   r.total_value,
      receiptCount: r.receipt_count,
    }));

    // ── Reconciliation alerts ─────────────────────────
    const reconciliationRows = rows<{
      id: number; merchant_name: string | null; receipt_type: string; status: string;
      declared_total: number; computed_total: number; confidence: number;
      flag_type: string; flag_message: string;
    }>(
      await pg().unsafe(`
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
      `)
    );
    const reconciliationAlerts = reconciliationRows
      .map(r => {
        const liveComputed = receiptComputedMap[r.id] ?? Number(r.computed_total);
        const variance    = Math.abs(Number(r.declared_total) - liveComputed);
        const variancePct = liveComputed > 0 ? Math.abs(variance / liveComputed * 100).toFixed(1) : "0";
        return {
          receiptId:     r.id,
          merchantName:  r.merchant_name ?? "—",
          receiptType:  r.receipt_type,
          status:       r.status,
          declaredTotal:  Number(r.declared_total),
          computedTotal: liveComputed,
          variance,
          variancePct,
          confidence:   Number(r.confidence),
          flagType:    r.flag_type,
          flagMessage: r.flag_message,
        };
      })
      .filter(a => a.declaredTotal > 0 || a.computedTotal > 0);

    // ── Computed ────────────────────────────────────────
    const grossProfit  = revenue - cogs;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const buyerCount    = Number(receiptCounts.find(r => r.type === "buyer")?.count    ?? 0);
    const supplierCount = Number(receiptCounts.find(r => r.type === "supplier")?.count ?? 0);
    const pendingCount  = Number(pendingReceipts[0]?.count ?? 0);

    const h = new Date().getHours();
    const greeting = h < 12 ? "Good morning" : h < 15 ? "Good afternoon" : "Good evening";

    return NextResponse.json({
      greeting,
      summary: {
        revenue,
        cogs,
        grossProfit,
        grossMargin: Math.round(grossMargin * 10) / 10,
        buyerReceipts:     buyerCount,
        supplierReceipts:  supplierCount,
        pendingFlags:      Number(flagCountResult[0]?.count ?? 0),
        totalReceipts:     buyerCount + supplierCount,
        pendingReceipts:   pendingCount,
        lineItemCount,
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

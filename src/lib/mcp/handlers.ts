/**
 * MCP Handlers — 14 tools for structured AI agent calls
 *
 * Adapted for postgres.js dialect from the original SQLite handlers.
 * All queries use raw SQL where needed to avoid drizzle GROUP BY issues.
 */

import { db, schema } from "@/lib/db";
import { eq, desc, sql, and, asc } from "drizzle-orm";

// ─── MCP Result Types ──────────────────────────────────────────────────────

export interface McpSuccess {
  content: { type: "text"; text: string }[];
  isError?: false;
}

export interface McpError {
  content: { type: "text"; text: string }[];
  isError: true;
}

export type McpResult = McpSuccess | McpError;

function ok(data: unknown): McpSuccess {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): McpError {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }) }], isError: true };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function rp(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

async function logActivity(
  receiptId: number,
  action: string,
  message: string,
  actor = "system"
) {
  try {
    await db.insert(schema.activityLogs).values({
      receiptId,
      action,
      message,
      actor,
    });
  } catch { /* non-critical */ }
}

// ─── Tool Handlers ────────────────────────────────────────────────────────

export async function handleGetSummary(): Promise<McpResult> {
  try {
    // Revenue: approved supplier receipts, IDR only
    const [revRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(declared_total), 0)` })
      .from(schema.receipts)
      .where(
        and(
          sql`receipt_type = 'supplier'`,
          sql`status = 'approved'`,
          sql`currency = 'IDR'`,
        )
      );

    // COGS: approved buyer receipts
    const [cogsRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(declared_total), 0)` })
      .from(schema.receipts)
      .where(
        and(
          sql`receipt_type = 'buyer'`,
          sql`status = 'approved'`,
          sql`currency = 'IDR'`,
        )
      );

    // Receipt counts by status
    const allRows = await db.select({
      status: schema.receipts.status,
    }).from(schema.receipts);

    const counts = { total: 0, approved: 0, pending: 0, flagged: 0, rejected: 0 };
    for (const r of allRows) {
      counts.total++;
      if (r.status === "approved") counts.approved++;
      else if (r.status === "pending") counts.pending++;
      else if (r.status === "flagged") counts.flagged++;
      else if (r.status === "rejected") counts.rejected++;
    }

    // Line item count
    const [{ count: liCount }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.lineItems);

    // Flag summary
    const flagRows = await db.execute(sql<{
      flag_type: string;
      unresolved: number;
      total: number;
    }>`
      SELECT flag_type,
             COALESCE(SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END), 0)::int AS unresolved,
             COUNT(*)::int AS total
      FROM flags GROUP BY flag_type
    `);
    const flagSummary = (flagRows as any[]).map(r => ({
      flagType: r.flag_type,
      unresolved: Number(r.unresolved ?? 0),
      total: Number(r.total ?? 0),
    }));

    const revenue = Number(revRow?.total ?? 0);
    const cogs    = Number(cogsRow?.total ?? 0);

    return ok({
      totalRevenue:  revenue,
      totalCOGS:     cogs,
      grossMargin:   revenue - cogs,
      marginPct:     revenue > 0 ? ((revenue - cogs) / revenue * 100).toFixed(1) : "0.0",
      receiptCounts: counts,
      lineItemCount: Number(liCount ?? 0),
      flagSummary,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function handleListReceipts(args: Record<string, unknown>): Promise<McpResult> {
  try {
    const status      = args.status as string | undefined;
    const receiptType = args.receiptType as string | undefined;
    const limit = Math.min(Number(args.limit ?? 20), 100);
    const offset = Number(args.offset ?? 0);

    const conds: any[] = [];
    if (status)      conds.push(sql`${schema.receipts.status} = ${status}`);
    if (receiptType) conds.push(sql`${schema.receipts.receiptType} = ${receiptType}`);

    const receipts = await db
      .select()
      .from(schema.receipts)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.receipts.receiptDate))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.receipts)
      .where(conds.length ? and(...conds) : undefined);

    return ok({ receipts, total: Number(count ?? 0), limit, offset });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function handleGetReceipt(args: Record<string, unknown>): Promise<McpResult> {
  try {
    const id = Number(args.receiptId);
    if (!id) return err("receiptId is required");

    const [receipt] = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, id))
      .limit(1);

    if (!receipt) return err(`Receipt ${id} not found`);

    const lineItems = await db
      .select()
      .from(schema.lineItems)
      .where(eq(schema.lineItems.receiptId, id));

    const flags = await db
      .select()
      .from(schema.flags)
      .where(eq(schema.flags.receiptId, id));

    return ok({ receipt, lineItems, flags });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function handleGetFlags(args: Record<string, unknown>): Promise<McpResult> {
  try {
    const unresolvedOnly = args.unresolvedOnly !== false;
    const flagType = args.flagType as string | undefined;

    const conds: any[] = [];
    if (unresolvedOnly) conds.push(eq(schema.flags.resolved, 0));
    if (flagType)       conds.push(eq(schema.flags.flagType, flagType));

    const flags = await db
      .select({
        id: schema.flags.id,
        flagType: schema.flags.flagType,
        message: schema.flags.message,
        resolved: schema.flags.resolved,
        createdAt: schema.flags.createdAt,
        receiptId: schema.flags.receiptId,
        receiptDate: schema.receipts.receiptDate,
        receiptType: schema.receipts.receiptType,
        merchantName: schema.receipts.merchantName,
        declaredTotal: schema.receipts.declaredTotal,
      })
      .from(schema.flags)
      .leftJoin(schema.receipts, eq(schema.flags.receiptId, schema.receipts.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(schema.flags.createdAt));

    return ok({ flags });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function handleGetStock(args: Record<string, unknown>): Promise<McpResult> {
  try {
    const lowStockOnly = args.lowStockOnly === true;

    const stockData = await db.execute(sql<{
      sku_id: number; normalized_name: string | null;
      part_number: string | null; category: string | null; unit: string | null;
      in_qty: number; out_qty: number; stock_value: number;
    }>`
      SELECT
        sl.sku_id,
        COALESCE(s.normalized_name, 'Unknown') AS normalized_name,
        s.part_number,
        s.category,
        COALESCE(s.unit, 'pcs') AS unit,
        COALESCE(SUM(CASE WHEN sl.movement_type = 'in' THEN sl.quantity ELSE 0 END), 0) AS in_qty,
        COALESCE(SUM(CASE WHEN sl.movement_type = 'out' THEN sl.quantity ELSE 0 END), 0) AS out_qty,
        COALESCE(SUM(CASE WHEN sl.movement_type = 'in' THEN sl.quantity * sl.unit_price ELSE 0 END), 0) AS stock_value
      FROM stock_ledger sl
      LEFT JOIN skus s ON sl.sku_id = s.id
      GROUP BY sl.sku_id, s.normalized_name, s.part_number, s.category, s.unit
      ORDER BY sl.sku_id
    `);

    let stock = (stockData as any[]).map((row) => {
      const inQty = Number(row.in_qty ?? 0);
      const outQty = Number(row.out_qty ?? 0);
      return {
        skuId:     row.sku_id,
        skuName:   row.normalized_name ?? "Unknown",
        partNumber: row.part_number,
        category:  row.category ?? "uncategorized",
        unit:      row.unit ?? "pcs",
        stockIn:   inQty,
        stockOut:  outQty,
        balance:   inQty - outQty,
        stockValue: Number(row.stock_value ?? 0),
      };
    });

    if (lowStockOnly) stock = stock.filter(s => s.balance <= 0);

    return ok({ stock });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function handleGetReceiptLogs(args: Record<string, unknown>): Promise<McpResult> {
  try {
    const id = Number(args.receiptId);
    if (!id) return err("receiptId is required");

    const logs = await db
      .select()
      .from(schema.activityLogs)
      .where(eq(schema.activityLogs.receiptId, id))
      .orderBy(asc(schema.activityLogs.createdAt));

    return ok({ logs });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function handleGetRevenueTrends(args: Record<string, unknown>): Promise<McpResult> {
  try {
    const year = Number(args.year ?? new Date().getFullYear());

    const trends = await db.execute(sql<{
      month: string;
      total_revenue: number;
      total_cogs: number;
      receipt_count: number;
    }>`
      SELECT
        to_char(r.receipt_date, 'YYYY-MM') AS month,
        COALESCE(SUM(CASE WHEN r.receipt_type = 'supplier' AND r.status = 'approved' THEN r.declared_total ELSE 0 END), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN r.receipt_type = 'buyer'    AND r.status = 'approved' THEN r.declared_total ELSE 0 END), 0) AS total_cogs,
        COUNT(*)::int AS receipt_count
      FROM receipts r
      WHERE EXTRACT(YEAR FROM r.receipt_date) = ${year} AND r.status = 'approved'
      GROUP BY to_char(r.receipt_date, 'YYYY-MM')
      ORDER BY month
    `);

    const formatted = (trends as any[]).map(r => ({
      month: r.month,
      totalRevenue: Number(r.total_revenue ?? 0),
      totalCOGS:    Number(r.total_cogs ?? 0),
      grossProfit:  Number(r.total_revenue ?? 0) - Number(r.total_cogs ?? 0),
      receiptCount: Number(r.receipt_count ?? 0),
    }));

    return ok({ year, trends: formatted });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function handleGetTopMerchants(args: Record<string, unknown>): Promise<McpResult> {
  try {
    const limit = Math.min(Number(args.limit ?? 10), 50);

    const merchants = await db.execute(sql<{
      merchant_name: string | null;
      total_value: number;
      receipt_count: number;
    }>`
      SELECT
        merchant_name,
        COALESCE(SUM(declared_total), 0) AS total_value,
        COUNT(*)::int AS receipt_count
      FROM receipts
      WHERE status = 'approved' AND merchant_name IS NOT NULL
      GROUP BY merchant_name
      ORDER BY total_value DESC
      LIMIT ${limit}
    `);

    const formatted = (merchants as any[]).map(r => ({
      merchantName: r.merchant_name ?? "—",
      totalValue:   Number(r.total_value ?? 0),
      receiptCount: Number(r.receipt_count ?? 0),
    }));

    return ok({ merchants: formatted });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function handleCreateReceipt(args: Record<string, unknown>): Promise<McpResult> {
  try {
    const receiptType  = (args.receiptType as string) ?? "buyer";
    const imageUrl     = (args.imageUrl as string) ?? "";
    const merchantName = (args.merchantName as string) ?? "—";
    const receiptDate  = args.receiptDate ? new Date(args.receiptDate as string) : new Date();

    if (!["buyer", "supplier"].includes(receiptType)) {
      return err(`receiptType must be "buyer" or "supplier", got "${receiptType}"`);
    }

    const [receipt] = await db.insert(schema.receipts).values({
      receiptType: receiptType as "buyer" | "supplier",
      merchantName,
      receiptDate,
      declaredTotal: 0,
      computedTotal: 0,
      currency: "IDR",
      status: "pending",
      imageUrl,
    }).returning();

    await logActivity(receipt.id, "photo_uploaded", "Receipt created from photo upload", "telegram");

    return ok({ receipt });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function handleAddLineItems(args: Record<string, unknown>): Promise<McpResult> {
  try {
    const receiptId = Number(args.receiptId);
    if (!receiptId) return err("receiptId is required");

    const items = args.items as Array<{
      description?: string;
      quantity?: number;
      unit?: string;
      unitPrice?: number;
      totalPrice?: number;
      partNumber?: string;
    }> | undefined;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return err("items must be a non-empty array");
    }

    const [receipt] = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, receiptId))
      .limit(1);

    if (!receipt) return err(`Receipt ${receiptId} not found`);

    const lineItems = await db.insert(schema.lineItems).values(
      items.map(item => ({
        receiptId,
        rawDescription: item.description ?? "",
        normalizedDescription: item.description,
        partNumber: item.partNumber ?? null,
        quantity: item.quantity ?? 1,
        unit: item.unit ?? "pcs",
        unitPrice: item.unitPrice ?? 0,
        totalPrice: item.totalPrice ?? ((item.unitPrice ?? 0) * (item.quantity ?? 1)),
        confidence: 1.0,
      }))
    ).returning();

    return ok({ receiptId, lineItems });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function handleApproveReceipt(args: Record<string, unknown>): Promise<McpResult> {
  try {
    const id = Number(args.receiptId);
    if (!id) return err("receiptId is required");

    const [receipt] = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, id))
      .limit(1);

    if (!receipt) return err(`Receipt ${id} not found`);
    if (receipt.status === "approved") return err(`Receipt ${id} already approved`);
    if (receipt.status === "rejected") return err(`Receipt ${id} already rejected`);

    await db.update(schema.receipts)
      .set({ status: "approved" as any })
      .where(eq(schema.receipts.id, id));

    await logActivity(id, "approved", `Receipt approved — total ${rp(receipt.declaredTotal ?? 0)}`, "dashboard");

    // Buyer receipt → stock ledger
    if (receipt.receiptType === "buyer") {
      const lineItems = await db
        .select()
        .from(schema.lineItems)
        .where(eq(schema.lineItems.receiptId, id));

      for (const item of lineItems) {
        if (!item.skuId) continue;

        const allLedger = await db
          .select()
          .from(schema.stockLedger)
          .where(eq(schema.stockLedger.skuId, item.skuId));

        const currentBalance = allLedger.length > 0
          ? Math.max(...allLedger.map(e => e.runningBalance ?? 0))
          : 0;

        await db.insert(schema.stockLedger).values({
          skuId: item.skuId,
          receiptId: id,
          lineItemId: item.id,
          movementType: "in",
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          runningBalance: currentBalance + item.quantity,
          notes: `Stock in from buyer receipt #${id}`,
        });
      }

      await logActivity(id, "stock_updated", `${lineItems.length} line items → stock ledger`, "system");
    }

    return ok({ receiptId: id, newStatus: "approved" });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function handleRejectReceipt(args: Record<string, unknown>): Promise<McpResult> {
  try {
    const id    = Number(args.receiptId);
    const notes = (args.notes as string) ?? "";
    if (!id) return err("receiptId is required");

    const [receipt] = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, id))
      .limit(1);

    if (!receipt) return err(`Receipt ${id} not found`);
    if (receipt.status === "approved") return err(`Receipt ${id} already approved`);
    if (receipt.status === "rejected") return err(`Receipt ${id} already rejected`);

    await db.update(schema.receipts)
      .set({
        status: "rejected" as any,
        notes: notes ? [receipt.notes, notes].filter(Boolean).join(" | ") : receipt.notes,
      })
      .where(eq(schema.receipts.id, id));

    await logActivity(id, "rejected", notes ? `Rejected: ${notes}` : "Receipt rejected", "dashboard");

    return ok({ receiptId: id, newStatus: "rejected" });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function handleFlagReceipt(args: Record<string, unknown>): Promise<McpResult> {
  try {
    const id       = Number(args.receiptId);
    const flagType = args.flagType as string;
    const message  = (args.message as string) ?? "";
    if (!id)    return err("receiptId is required");
    if (!flagType) return err("flagType is required");

    const validTypes = ["MATH_ERROR", "MISSING_DATE", "MISSING_INVOICE_NO",
      "NEGATIVE_STOCK", "UNRECONCILED", "DUPLICATE",
      "FOREIGN_CURRENCY", "DEAD_STOCK", "LOW_CONFIDENCE"];

    if (!validTypes.includes(flagType)) {
      return err(`Invalid flagType. Must be one of: ${validTypes.join(", ")}`);
    }

    const [receipt] = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, id))
      .limit(1);

    if (!receipt) return err(`Receipt ${id} not found`);

    const [flag] = await db.insert(schema.flags).values({
      receiptId: id,
      flagType: flagType as any,
      message,
    }).returning();

    await logActivity(id, "flag_raised", `${flagType}: ${message}`, "dashboard");

    return ok({ flag });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function handleEraseReceipt(args: Record<string, unknown>): Promise<McpResult> {
  try {
    const id = Number(args.receiptId);
    if (!id) return err("receiptId is required");

    const [receipt] = await db
      .select()
      .from(schema.receipts)
      .where(eq(schema.receipts.id, id))
      .limit(1);

    if (!receipt) return err(`Receipt ${id} not found`);

    // Cascade delete related records
    await db.delete(schema.stockLedger).where(eq(schema.stockLedger.receiptId, id));
    await db.delete(schema.lineItems).where(eq(schema.lineItems.receiptId, id));
    await db.delete(schema.flags).where(eq(schema.flags.receiptId, id));
    await db.delete(schema.activityLogs).where(eq(schema.activityLogs.receiptId, id));
    await db.delete(schema.receipts).where(eq(schema.receipts.id, id));

    return ok({
      deleted: true,
      receiptId: id,
      merchantName: receipt.merchantName ?? "—",
      declaredTotal: receipt.declaredTotal ?? 0,
    });
  } catch (e) {
    return err(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Dispatcher ────────────────────────────────────────────────────────────

export const TOOL_HANDLERS: Record<string, (args: Record<string, unknown>) => Promise<McpResult>> = {
  get_summary:        handleGetSummary,
  list_receipts:     handleListReceipts,
  get_receipt:       handleGetReceipt,
  get_flags:          handleGetFlags,
  get_stock:          handleGetStock,
  get_receipt_logs:   handleGetReceiptLogs,
  get_revenue_trends: handleGetRevenueTrends,
  get_top_merchants:  handleGetTopMerchants,
  create_receipt:    handleCreateReceipt,
  add_line_items:    handleAddLineItems,
  approve_receipt:   handleApproveReceipt,
  reject_receipt:    handleRejectReceipt,
  flag_receipt:      handleFlagReceipt,
  erase_receipt:     handleEraseReceipt,
};

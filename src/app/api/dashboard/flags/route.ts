import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, sql } from "drizzle-orm";
import { requireApiKey } from "@/lib/auth";

// GET /api/dashboard/flags
export async function GET(request: NextRequest) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  try {
    // Use raw SQL join to avoid drizzle GROUP BY column qualification issues
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
      .leftJoin(schema.receipts, sql`${schema.flags.receiptId} = ${schema.receipts.id}`)
      .where(sql`receipts.currency = 'IDR' OR ${schema.flags.receiptId} IS NULL`)
      .orderBy(desc(schema.flags.id));

    // Count by type — use raw SQL to avoid drizzle GROUP BY column name issues
    let flagCounts: any[] = [];
    try {
      const flagCountsRaw: any[] = await db.execute(
        sql`SELECT f.flag_type, COUNT(*)::int as count, SUM(CASE WHEN f.resolved = FALSE THEN 1 ELSE 0 END)::int as unresolved, COUNT(DISTINCT f.receipt_id)::int as receipt_count FROM flags f LEFT JOIN receipts r ON f.receipt_id = r.id WHERE r.currency = 'IDR' OR f.receipt_id IS NULL GROUP BY f.flag_type`
      );
      flagCounts = flagCountsRaw.map((r: any) => ({
        flagType:     r.flag_type,
        count:        Number(r.count ?? 0),
        unresolved:   Number(r.unresolved ?? 0),
        receiptCount: Number(r.receipt_count ?? 0),
      }));
    } catch (e: any) {
      console.error("[flags/agg]", e?.message ?? e);
      // Graceful degradation — return empty counts
    }

    return NextResponse.json({ flags, flagCounts });
  } catch (err: any) {
    console.error("[flags]", err?.message ?? err);
    return NextResponse.json({ error: "Failed to fetch flags", detail: err?.message }, { status: 500 });
  }
}

// PATCH /api/dashboard/flags — resolve a flag (and optionally set invoice number)
export async function PATCH(request: NextRequest) {
  const authError = await requireApiKey(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { flagId, resolved = true, resolvedBy = "owner", invoiceNumber } = body;
    const invoiceFromData = body.data?.invoiceNumber as string | undefined;

    if (!flagId) {
      return NextResponse.json({ error: "flagId is required" }, { status: 400 });
    }

    const [flag] = await db
      .select({ receiptId: schema.flags.receiptId })
      .from(schema.flags)
      .where(eq(schema.flags.id, flagId))
      .limit(1);

    const invoice = invoiceNumber ?? invoiceFromData;
    if (invoice && flag?.receiptId) {
      await db
        .update(schema.receipts)
        .set({ invoiceNumber: invoice })
        .where(eq(schema.receipts.id, flag.receiptId));
    }

    await db
      .update(schema.flags)
      .set({
        resolved: resolved ? true : false,
        resolvedBy,
        resolvedAt: new Date(),
      })
      .where(eq(schema.flags.id, flagId));

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[flags/patch]", err?.message ?? err);
    return NextResponse.json({ error: "Failed to update flag" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, sql } from "drizzle-orm";

// GET /api/dashboard/flags
export async function GET() {
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
      .orderBy(desc(schema.flags.id));

    // Count by type — use raw SQL to avoid drizzle GROUP BY column name issues
    let flagCounts: any[] = [];
    try {
      const flagCountsRaw: any[] = await db.execute(
        sql`SELECT flag_type, COUNT(*) as count, SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as unresolved FROM flags GROUP BY flag_type`
      );
      flagCounts = flagCountsRaw.map((r: any) => ({
        flagType: r.flag_type,
        count: Number(r.count ?? 0),
        unresolved: Number(r.unresolved ?? 0),
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

// PATCH /api/dashboard/flags — resolve a flag
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { flagId, resolved = true, resolvedBy = "owner" } = body;

    if (!flagId) {
      return NextResponse.json({ error: "flagId is required" }, { status: 400 });
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

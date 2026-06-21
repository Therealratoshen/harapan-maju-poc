import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, desc, sql } from "drizzle-orm";

// GET /api/dashboard/flags
export async function GET() {
  try {
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
      .orderBy(desc(schema.flags.createdAt));

    // Count by type
    const flagCounts = await db
      .select({
        flagType: schema.flags.flagType,
        count: sql<number>`COUNT(*)`,
        unresolved: sql<number>`SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END)`,
      })
      .from(schema.flags)
      .groupBy(schema.flags.flagType);

    return NextResponse.json({ flags, flagCounts });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch flags" }, { status: 500 });
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
        resolved: resolved ? 1 : 0,
        resolvedBy,
        resolvedAt: new Date(),
      })
      .where(eq(schema.flags.id, flagId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update flag" }, { status: 500 });
  }
}

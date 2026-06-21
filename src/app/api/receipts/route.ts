import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, like, desc, sql, or } from "drizzle-orm";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

// ─── GET /api/receipts ────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type   = searchParams.get("type");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const limit  = parseInt(searchParams.get("limit") ?? "100");

  try {
    const conditions: any[] = [];

    if (type && type !== "all") {
      conditions.push(eq(schema.receipts.receiptType, type as "buyer" | "supplier"));
    }

    if (status && status !== "all") {
      conditions.push(eq(schema.receipts.status, status as any));
    }

    if (search) {
      const q = `%${search}%`;
      conditions.push(
        or(
          like(schema.receipts.merchantName, q),
          like(schema.receipts.customerName, q),
          like(schema.receipts.invoiceNumber, q),
        )
      );
    }

    // Also fetch line items for each receipt
    const receipts = await db
      .select()
      .from(schema.receipts)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.receipts.receiptDate))
      .limit(limit);

    // Fetch line items and flags for these receipts
    const receiptIds = receipts.map(r => r.id);
    const allLineItems = receiptIds.length > 0
      ? await db.select().from(schema.lineItems)
      : [];
    const allFlags = receiptIds.length > 0
      ? await db.select().from(schema.flags)
      : [];

    const receiptsWithData = receipts.map(r => ({
      ...r,
      lineItems: allLineItems.filter(li => li.receiptId === r.id),
      flags: allFlags.filter(f => f.receiptId === r.id),
    }));

    return NextResponse.json({ receipts: receiptsWithData });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch receipts" }, { status: 500 });
  }
}

// ─── POST /api/receipts ──────────────────────────────────────────────────────
// Creates a new pending receipt. If base64Image is provided, saves to disk.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      base64Image,
      fileName = "receipt.jpg",
      receiptDate,
      receiptType = "buyer",
      merchantName = "—",
      customerName,
      invoiceNumber,
    } = body;

    let imageUrl = "";

    if (base64Image) {
      try {
        const uploadDir = join(process.cwd(), "public", "uploads");
        await mkdir(uploadDir, { recursive: true });

        // Strip data URI prefix if present
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        const ext = fileName.toLowerCase().includes(".png") ? "png" : "jpg";
        const filename = `upload_${Date.now()}.${ext}`;
        await writeFile(join(uploadDir, filename), buffer);
        imageUrl = `/uploads/${filename}`;
      } catch (fsErr) {
        console.error("Failed to save image:", fsErr);
        // Continue without image — receipt is still created
      }
    }

    const receiptTypeEnum = receiptType === "supplier" ? "supplier" : "buyer";

    const [receipt] = await db.insert(schema.receipts).values({
      receiptType: receiptTypeEnum as "buyer" | "supplier",
      merchantName: merchantName ?? "—",
      customerName: customerName ?? null,
      invoiceNumber: invoiceNumber ?? null,
      receiptDate: receiptDate ? new Date(receiptDate) : new Date(),
      declaredTotal: 0,
      computedTotal: 0,
      currency: "IDR",
      status: "pending",
      confidence: 0,
      imageUrl,
      sourceFile: fileName,
    }).returning();

    return NextResponse.json({
      success: true,
      id: receipt.id,
      status: "pending",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create receipt" }, { status: 500 });
  }
}

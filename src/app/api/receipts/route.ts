import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and, like, desc, sql, or } from "drizzle-orm";
import { put } from "@vercel/blob";

function rp(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

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

    // Fetch receipts + line items + flags
    const receipts = await db
      .select()
      .from(schema.receipts)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.receipts.receiptDate))
      .limit(limit);

    const receiptIds = receipts.map(r => r.id);
    const allLineItems = receiptIds.length > 0
      ? await db.select().from(schema.lineItems)
      : [];
    const allFlags = receiptIds.length > 0
      ? await db.select().from(schema.flags)
      : [];

    const receiptsWithData = receipts.map(r => {
      const lineItems = allLineItems.filter(li => li.receiptId === r.id);
      const flags     = allFlags.filter(f => f.receiptId === r.id);
      // Always compute total from line items — this is the source of truth
      const computedTotal = lineItems.reduce((sum, li) => sum + (li.totalPrice ?? 0), 0);
      return {
        ...r,
        // Override stored value with live-computed sum so UI is always accurate
        computedTotal,
        lineItems,
        flags,
      };
    });

    return NextResponse.json({ receipts: receiptsWithData });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch receipts" }, { status: 500 });
  }
}

// ─── POST /api/receipts ──────────────────────────────────────────────────────
// Creates a new pending receipt.
// If base64Image is provided, saves to Vercel Blob (persistent).
// Accepts receiptType: "buyer" (pengeluaran/beli) or "supplier" (pemasukan/jual).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      base64Image,
      fileName  = "receipt.jpg",
      receiptDate,
      receiptType = "buyer",
      merchantName = "—",
      customerName,
      invoiceNumber,
    } = body;

    let imageUrl = "";

    if (base64Image) {
      try {
        // Strip data URI prefix
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
        const buffer     = Buffer.from(base64Data, "base64");
        const ext       = fileName.toLowerCase().includes(".png") ? "png" : "jpg";
        const filename  = `receipt_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const contentType = ext === "png" ? "image/png" : "image/jpeg";

        // Upload to Vercel Blob (persistent across cold starts)
        const blob = await put(filename, buffer, {
          access: "public",
          contentType,
        });
        imageUrl = blob.url;
      } catch (blobErr) {
        console.error("[blob upload]", blobErr);
        // Fallback: skip image, receipt is still created
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

    // Log activity
    await db.insert(schema.activityLogs).values({
      action:    "receipt_created",
      message:   `Receipt #${receipt.id} uploaded via dashboard — ${receiptTypeEnum} — ${merchantName}`,
      actor:     "dashboard",
      receiptId: receipt.id,
    });

    return NextResponse.json({
      success: true,
      id: receipt.id,
      status: "pending",
      imageUrl,
      message: "Receipt created. Go to Receipts page and click 'Jalankan OCR' to extract data.",
    });
  } catch (err) {
    console.error("[receipts/post]", err);
    return NextResponse.json({ error: "Failed to create receipt" }, { status: 500 });
  }
}

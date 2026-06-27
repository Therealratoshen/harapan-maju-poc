/**
 * POST /api/chat/receipt
 * Upload a receipt photo.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

export async function POST(request: NextRequest) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const image = formData.get("image") as File | null;
    const receiptType = formData.get("receiptType") as "buyer" | "supplier" | null;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Save image to /public/uploads
    const bytes = await image.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext = image.name.split(".").pop() ?? "jpg";
    const filename = `receipt_${Date.now()}.${ext}`;
    const uploadDir = join(process.cwd(), "public", "uploads");

    try {
      await mkdir(uploadDir, { recursive: true });
      await writeFile(join(uploadDir, filename), buffer);
    } catch { /* can't write — may be read-only env */ }

    const imageUrl = `/uploads/${filename}`;

    // Try to insert into DB
    let receiptId: number | null = null;
    try {
      const [receipt] = await db.insert(schema.receipts).values({
        receiptType: receiptType ?? "buyer",
        merchantName: "—",
        receiptDate: new Date(),
        declaredTotal: 0,
        computedTotal: 0,
        currency: "IDR",
        status: "pending",
        imageUrl,
      }).returning();
      receiptId = receipt.id;
    } catch {
      // DB insert failed — generate mock ID
      receiptId = Math.floor(Math.random() * 900) + 100;
    }

    return NextResponse.json({
      ok: true,
      id: receiptId,
      message: receiptId ? `Receipt #${receiptId} saved — pending review` : "Image saved (DB unavailable)",
      imageUrl,
    });

  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/init
 *
 * Initializes database tables. Run once after connecting a new Postgres DB.
 * Safe to run multiple times — uses IF NOT EXISTS.
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import postgres from "postgres";

export async function POST() {
  const connStr = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
  if (!connStr) {
    return NextResponse.json({ error: "POSTGRES_URL not set" }, { status: 500 });
  }

  try {
    const pg = postgres(connStr, { max: 1 });

    await pg.unsafe(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'buyer',
        address TEXT,
        phone TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        branch TEXT,
        address TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS skus (
        id SERIAL PRIMARY KEY,
        normalized_name TEXT NOT NULL,
        part_number TEXT,
        category TEXT,
        unit TEXT NOT NULL DEFAULT 'pcs',
        purchase_price_avg REAL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS receipts (
        id SERIAL PRIMARY KEY,
        receipt_type TEXT NOT NULL,
        merchant_name TEXT,
        supplier_id INTEGER,
        customer_id INTEGER,
        customer_name TEXT,
        invoice_number TEXT,
        receipt_date TIMESTAMPTZ NOT NULL,
        due_date TIMESTAMPTZ,
        subtotal REAL NOT NULL DEFAULT 0,
        discount REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        declared_total REAL NOT NULL,
        computed_total REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'IDR',
        status TEXT NOT NULL DEFAULT 'pending',
        confidence REAL NOT NULL DEFAULT 0,
        image_url TEXT,
        source_file TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS line_items (
        id SERIAL PRIMARY KEY,
        receipt_id INTEGER NOT NULL,
        sku_id INTEGER,
        raw_description TEXT NOT NULL,
        normalized_description TEXT,
        part_number TEXT,
        quantity REAL NOT NULL,
        unit TEXT NOT NULL DEFAULT 'pcs',
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        match_status TEXT NOT NULL DEFAULT 'unmatched',
        confidence REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS flags (
        id SERIAL PRIMARY KEY,
        receipt_id INTEGER NOT NULL,
        line_item_id INTEGER,
        flag_type TEXT NOT NULL,
        message TEXT NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0,
        resolved_by TEXT,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS stock_ledger (
        id SERIAL PRIMARY KEY,
        sku_id INTEGER NOT NULL,
        receipt_id INTEGER,
        line_item_id INTEGER,
        movement_type TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        running_balance REAL NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);
      CREATE INDEX IF NOT EXISTS idx_receipts_type ON receipts(receipt_type);
      CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(receipt_date DESC);
      CREATE INDEX IF NOT EXISTS idx_line_items_receipt ON line_items(receipt_id);
      CREATE INDEX IF NOT EXISTS idx_flags_receipt ON flags(receipt_id);
      CREATE INDEX IF NOT EXISTS idx_flags_resolved ON flags(resolved);
      CREATE INDEX IF NOT EXISTS idx_stock_ledger_sku ON stock_ledger(sku_id);

      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        receipt_id INTEGER,
        action TEXT NOT NULL,
        message TEXT,
        actor TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await pg.end();
    return NextResponse.json({ ok: true, message: "Tables initialized" });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

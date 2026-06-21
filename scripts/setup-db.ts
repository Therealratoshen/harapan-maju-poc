/**
 * Setup + Seed script for CV. Harapan Maju
 *
 * Prerequisites:
 * 1. Create a Vercel Postgres database:
 *    → https://vercel.com/dashboard → harpan-maju-poc → Storage → Create Database
 *    → Region: Singapore (or closest to you)
 *
 * 2. Copy the POSTGRES_URL connection string
 *
 * 3. Set environment variable:
 *    export POSTGRES_URL="postgres://..."
 *    export TELEGRAM_BOT_TOKEN="..."
 *    export OWNER_CHAT_ID="..."
 *    export MINIMAX_API_KEY="..."
 *
 * 4. Run this script:
 *    cd harapan-maju-poc && npx tsx scripts/setup-db.ts
 *
 * 5. Then redeploy to pick up env vars:
 *    vercel --prod
 */

import postgres from "postgres";
import { resolve } from "path";
import { readFileSync } from "fs";

// ─── Connect ────────────────────────────────────────────────────────────────
const connStr = process.env.POSTGRES_URL;
if (!connStr) {
  console.error("❌ POSTGRES_URL not set. See instructions above.");
  process.exit(1);
}

const sql = postgres(connStr, { max: 1 });

// ─── Schema ────────────────────────────────────────────────────────────────

const INIT_SQL = `
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
`;

// ─── Run ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔧 Creating tables...");
  await sql.unsafe(INIT_SQL);
  console.log("✅ Tables created");

  // ── Seed ────────────────────────────────────────────────────────────────
  console.log("🌱 Seeding data...");

  // Clear
  await sql`DELETE FROM stock_ledger`;
  await sql`DELETE FROM flags`;
  await sql`DELETE FROM line_items`;
  await sql`DELETE FROM receipts`;
  await sql`DELETE FROM skus`;
  await sql`DELETE FROM customers`;
  await sql`DELETE FROM suppliers`;

  // Suppliers
  const suppliers = await sql`
    INSERT INTO suppliers (name, type, address) VALUES
      ('PT Capella Patria Utama', 'buyer', 'Medan'),
      ('Panca Jaya', 'buyer', 'Medan'),
      ('Indako', 'buyer', 'Medan'),
      ('MM', 'buyer', 'Medan'),
      ('Central Motor (CM)', 'buyer', 'Medan')
    RETURNING id, name
  `;

  const [capella, pancaJaya, indako, mm, centralMotor] = suppliers;

  // Customers
  const customers = await sql`
    INSERT INTO customers (name, branch) VALUES
      ('Kharisma Jaya', 'P. Bulan'),
      ('Honda Jaya', 'P. Bulan'),
      ('Honda Jaya', 'P. Siantar'),
      ('Honda Jaya', ''),
      ('Hasan Jaya', 'P. Baru'),
      ('Asoka Jaya', 'P. Siantar')
    RETURNING id, name, branch
  `;

  const [kharismaJaya, hondaJayaPBulan, hondaJayaPSiantar, hondaJaya, hasanJaya, asokaJaya] = customers;

  // SKUs
  const skus = await sql`
    INSERT INTO skus (normalized_name, category, unit, purchase_price_avg) VALUES
      ('Cycle Matic 4T 20W-40 0.8L', 'oil', 'liter', 36000),
      ('QTC UNI Oil 20/50 0.8L', 'oil', 'liter', 47000),
      ('Honda Oli MPX2 10W30 0.8L', 'oil', 'liter', 59860),
      ('Oplus Wanz Brake Fluid 300ml', 'brake', 'pcs', 192000),
      ('XTP Radiator Coolant 1L', 'coolant', 'pcs', 140000),
      ('IRC NR 92 TL 70/90-17', 'tire', 'pcs', 260000),
      ('IRC REBORN NR 87 TL 90/80-14', 'tire', 'pcs', 218000),
      ('IRC NF 25 TL 80/100-17', 'tire', 'pcs', 425000),
      ('IRC RX-01 RTL 140/70-17', 'tire', 'pcs', 419000),
      ('Honda TIRE FR TL 110/80-14', 'tire', 'pcs', 405000)
    RETURNING id, normalized_name
  `;

  const [oliCycleMatic, qtcUniOil, oliMpx2, brakeFluid, radiatorCoolant,
    ircNr92, ircReborn, ircNf25, ircRx01, hondaFrontTire] = skus;

  // ── Buyer receipts (B1-B10) ─────────────────────────────────────────────
  const r1 = await sql`
    INSERT INTO receipts (receipt_type, supplier_id, merchant_name, customer_name,
      invoice_number, receipt_date, due_date, subtotal, discount, tax_amount,
      declared_total, computed_total, currency, status, confidence)
    VALUES ('buyer', ${capella.id}, 'PT Capella Patria Utama', 'EDDY',
      'FK. 202206_02334', '2022-06-10', '2022-06-10', 25920000, 1440000, 2425946,
      24480000, 25920000, 'IDR', 'approved', 0.95)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, sku_id, raw_description, normalized_description,
      quantity, unit, unit_price, total_price, match_status, confidence)
    VALUES (${r1[0].id}, ${oliCycleMatic.id}, 'CYCLE MATIC 4T 20W-40 24x0.8L',
      'Cycle Matic 4T 20W-40 0.8L', 30, 'carton', 864000, 25920000, 'matched', 0.9)
  `;

  await sql`
    INSERT INTO flags (receipt_id, flag_type, message)
    VALUES (${r1[0].id}, 'MATH_ERROR',
      'Computed total (Rp 25,920,000) differs from declared total (Rp 24,480,000) — likely DPP/PPN already deducted. Approved manually.')
  `;

  const r2 = await sql`
    INSERT INTO receipts (receipt_type, supplier_id, merchant_name, customer_name,
      invoice_number, receipt_date, due_date, subtotal, declared_total, computed_total,
      currency, status, confidence)
    VALUES ('buyer', ${pancaJaya.id}, 'Panca Jaya', 'Harapan Maju',
      'MBR/093826', '2026-06-11', '2026-06-18', 11280000, 11280000, 11280000,
      'IDR', 'approved', 0.95)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, sku_id, raw_description, normalized_description,
      quantity, unit, unit_price, total_price, match_status, confidence)
    VALUES (${r2[0].id}, ${qtcUniOil.id}, 'QTC UNI OIL 20/50 (24 x 800ML)',
      'QTC UNI Oil 20/50 0.8L', 240, 'bottle', 47000, 11280000, 'matched', 0.95)
  `;

  const r3 = await sql`
    INSERT INTO receipts (receipt_type, supplier_id, merchant_name, customer_name,
      invoice_number, receipt_date, due_date, subtotal, declared_total, computed_total,
      currency, status, confidence)
    VALUES ('buyer', ${indako.id}, 'Indako', 'CV. Harapan Maju',
      '079810/FAK-PD/W/06/2026', '2026-06-04', '2026-06-04', 38782800, 38782800, 38782800,
      'IDR', 'approved', 0.90)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, sku_id, raw_description, normalized_description,
      quantity, unit, unit_price, total_price, match_status, confidence)
    VALUES (${r3[0].id}, ${oliMpx2.id}, 'OLI MPX2 10W30 SL 0.8L FED',
      'Honda Oli MPX2 10W30 0.8L', 648, 'bottle', 59860, 38782800, 'matched', 0.9)
  `;

  const r4 = await sql`
    INSERT INTO receipts (receipt_type, supplier_id, merchant_name, customer_name,
      invoice_number, receipt_date, subtotal, declared_total, computed_total,
      currency, status, confidence)
    VALUES ('buyer', ${mm.id}, 'MM', 'Harapan Maju',
      '083063', '2026-06-11', 4720000, 4720000, 4720000,
      'IDR', 'approved', 0.90)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, sku_id, raw_description, quantity, unit,
      unit_price, total_price, match_status, confidence)
    VALUES
      (${r4[0].id}, ${brakeFluid.id}, 'Oplus Wanz Brake Fluid - Merah (300 ml)', 10, 'box', 192000, 1920000, 'matched', 0.85),
      (${r4[0].id}, ${radiatorCoolant.id}, 'XTP Radiator Coolant - Hijau (1 Ltr)', 20, 'box', 140000, 2800000, 'matched', 0.85)
  `;

  // B5: CVS foreign currency (flagged)
  const r5 = await sql`
    INSERT INTO receipts (receipt_type, merchant_name, customer_name, receipt_date,
      declared_total, computed_total, currency, status, confidence)
    VALUES ('buyer', 'CVS/pharmacy', 'Full House', '2024-05-06',
      9.28, 9.28, 'USD', 'flagged', 1.0)
    RETURNING id
  `;

  await sql`
    INSERT INTO flags (receipt_id, flag_type, message)
    VALUES (${r5[0].id}, 'FOREIGN_CURRENCY',
      'Receipt is in USD — personal purchase, not included in inventory calculations')
  `;

  const r6 = await sql`
    INSERT INTO receipts (receipt_type, supplier_id, merchant_name, customer_name,
      invoice_number, receipt_date, due_date, subtotal, discount, declared_total,
      computed_total, currency, status, confidence)
    VALUES ('buyer', ${centralMotor.id}, 'Central Motor (CM)', 'Setia Budi',
      '0626/JL/2115', '2026-06-12', '2026-07-12', 8946500, 4028450, 8966500,
      12994950, 'IDR', 'approved', 0.80)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, sku_id, raw_description, quantity, unit,
      unit_price, total_price, match_status, confidence)
    VALUES
      (${r6[0].id}, ${ircNr92.id}, 'IRC NR 92 TL 70/90-17', 5, 'pcs', 260000, 1300000, 'matched', 0.9),
      (${r6[0].id}, ${ircReborn.id}, 'IRC REBORN NR 87 TL 90/80-14', 5, 'pcs', 218000, 1090000, 'matched', 0.9),
      (${r6[0].id}, ${ircNf25.id}, 'IRC NF 25 TL 80/100-17', 20, 'pcs', 425000, 8500000, 'matched', 0.9),
      (${r6[0].id}, ${ircRx01.id}, 'IRC RX-01 RTL 140/70-17', 5, 'pcs', 419000, 2095000, 'matched', 0.9)
  `;

  await sql`
    INSERT INTO flags (receipt_id, flag_type, message)
    VALUES (${r6[0].id}, 'MATH_ERROR',
      'Computed total (Rp 12,994,950) ≠ declared total (Rp 8,966,500). 31% discount applied. Approved manually.')
  `;

  const r7 = await sql`
    INSERT INTO receipts (receipt_type, supplier_id, merchant_name, customer_name,
      invoice_number, receipt_date, due_date, subtotal, declared_total, computed_total,
      currency, status, confidence)
    VALUES ('buyer', ${indako.id}, 'Indako', 'CV. Harapan Maju',
      '082861/FAK-PO/M/06/2026', '2026-06-10', '2026-07-10', 1468125, 1468125, 1468125,
      'IDR', 'approved', 0.90)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, sku_id, raw_description, part_number, quantity,
      unit, unit_price, total_price, match_status, confidence)
    VALUES (${r7[0].id}, ${hondaFrontTire.id}, 'TIRE FR TL (110/80-14)',
      '44711K0WNO1', 5, 'pcs', 405000, 1468125, 'matched', 0.9)
  `;

  // B8: Partial receipt (flagged)
  const r8 = await sql`
    INSERT INTO receipts (receipt_type, merchant_name, customer_name, receipt_date,
      declared_total, computed_total, currency, status, confidence, notes)
    VALUES ('buyer', 'Unknown', 'Harapan Maju', '2026-06-12',
      8050300, 0, 'IDR', 'flagged', 0.4,
      'Partial receipt — several items unreadable. Needs manual review.')
    RETURNING id
  `;

  await sql`
    INSERT INTO flags (receipt_id, flag_type, message)
    VALUES (${r8[0].id}, 'LOW_CONFIDENCE',
      'Receipt image quality is poor — line items partially unreadable. Manual entry required.')
  `;

  const r9 = await sql`
    INSERT INTO receipts (receipt_type, supplier_id, merchant_name, customer_name,
      invoice_number, receipt_date, due_date, subtotal, declared_total, computed_total,
      currency, status, confidence)
    VALUES ('buyer', ${indako.id}, 'Indako', 'CV. Harapan Maju',
      '081321/FAK-PD/W/06/2026', '2026-06-05', '2026-07-05', 23460275, 23460275, 23460275,
      'IDR', 'approved', 0.90)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, sku_id, raw_description, part_number, quantity,
      unit, unit_price, total_price, match_status, confidence)
    VALUES
      (${r9[0].id}, ${hondaFrontTire.id}, 'TIRE FR TL (80/90-14)', '44711K59A12', 57, 'pcs', 287000, 11860275, 'matched', 0.9),
      (${r9[0].id}, ${hondaFrontTire.id}, 'TIRE RR TL (90/90-14)', '42711K59A12', 50, 'pcs', 320000, 11600000, 'matched', 0.9)
  `;

  // B10: Metro CAD (flagged)
  await sql`
    INSERT INTO receipts (receipt_type, merchant_name, customer_name, receipt_date,
      declared_total, computed_total, currency, status, confidence)
    VALUES ('buyer', 'Metro', 'Full House', '2024-05-15',
      61.32, 61.32, 'CAD', 'flagged', 1.0)
  `;

  await sql`
    INSERT INTO flags (receipt_id, flag_type, message)
    VALUES (
      (SELECT id FROM receipts WHERE merchant_name = 'Metro' LIMIT 1),
      'FOREIGN_CURRENCY',
      'Receipt is in CAD — personal grocery purchase, not included in inventory calculations')
  `;

  // ── Supplier receipts (S1-S10) ─────────────────────────────────────────
  const s1 = await sql`
    INSERT INTO receipts (receipt_type, customer_id, merchant_name, customer_name,
      receipt_date, subtotal, declared_total, computed_total, currency, status, confidence, notes)
    VALUES ('supplier', ${kharismaJaya.id}, 'Anugrah', 'Kharisma Jaya',
      '2026-05-26', 16247100, 19247700, 16310100, 'IDR', 'flagged', 0.75,
      'Manual total correction noted — computed Rp 16,310,100 vs declared Rp 19,247,700')
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, raw_description, quantity, unit, unit_price, total_price, match_status, confidence)
    VALUES
      (${s1[0].id}, 'Oli Yamalube Silver 24x0.8L', 48, 'bottle', 45650, 2191200, 'unmatched', 0.8),
      (${s1[0].id}, 'Oli Super Matic 24x1', 24, 'bottle', 71000, 1704000, 'unmatched', 0.8),
      (${s1[0].id}, 'Oli MPX1 0.8', 24, 'bottle', 58500, 1404000, 'unmatched', 0.8),
      (${s1[0].id}, 'Oli Gear Matic 150ml', 48, 'bottle', 18750, 900000, 'unmatched', 0.8),
      (${s1[0].id}, '94416-17894', 5, 'pcs', 153000, 765000, 'uncertain', 0.6),
      (${s1[0].id}, 'Oli SPX2 0.8 12x0.8', 36, 'bottle', 48000, 1728000, 'unmatched', 0.8),
      (${s1[0].id}, 'Oli AX5 12x1=12', 12, 'bottle', 59200, 710400, 'unmatched', 0.8),
      (${s1[0].id}, 'Oli AX5 Matic 12x0.8=36', 36, 'bottle', 53600, 1929600, 'unmatched', 0.8)
  `;

  await sql`
    INSERT INTO flags (receipt_id, flag_type, message)
    VALUES
      (${s1[0].id}, 'MATH_ERROR', 'Computed line item sum (Rp 16,310,100) ≠ declared total (Rp 19,247,700). Variance: Rp 2,937,600. Awaiting manual review.'),
      (${s1[0].id}, 'MISSING_INVOICE_NO', 'No invoice number on receipt')
  `;

  const s2 = await sql`
    INSERT INTO receipts (receipt_type, merchant_name, customer_name, receipt_date,
      declared_total, computed_total, currency, status, confidence)
    VALUES ('supplier', 'Anjas', 'Hawa Jaya', '2026-05-26',
      10922310, 10922310, 'IDR', 'approved', 0.85)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, raw_description, quantity, unit, unit_price, total_price, match_status, confidence)
    VALUES
      (${s2[0].id}, '52XV-E2603-00 Tutup Kipas', 3, 'pcs', 21070, 63210, 'unmatched', 0.8),
      (${s2[0].id}, '93102-24802 Oil Seal', 20, 'pcs', 12470, 249400, 'unmatched', 0.8),
      (${s2[0].id}, 'Oli 2T PRO 20x3=60', 60, 'bottle', 71200, 2136000, 'unmatched', 0.8),
      (${s2[0].id}, 'Oli 2T EVLWB 20x3=60', 60, 'bottle', 54500, 1635000, 'unmatched', 0.8),
      (${s2[0].id}, '131A1-K0J-N10 Piston Kit', 2, 'set', 109120, 218240, 'unmatched', 0.8),
      (${s2[0].id}, 'Assy Jeckstm CS', 20, 'set', 188511, 3770220, 'unmatched', 0.8)
  `;

  const s3 = await sql`
    INSERT INTO receipts (receipt_type, customer_id, merchant_name, customer_name, receipt_date,
      declared_total, computed_total, currency, status, confidence, notes)
    VALUES ('supplier', ${hondaJayaPSiantar.id}, 'Honda Jaya', 'Honda Jaya P. Siantar',
      '2026-05-28', 7279020, 7277340, 'IDR', 'approved', 0.80,
      'Minor variance of Rp 1,680 — likely rounding. Approved.')
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, raw_description, quantity, unit, unit_price, total_price, match_status, confidence)
    VALUES
      (${s3[0].id}, 'Oli Federal 0.8 24x3=72', 72, 'bottle', 46000, 3312000, 'unmatched', 0.85),
      (${s3[0].id}, '50C-WB01G-00 Shoe Komplit', 1, 'set', 589960, 589960, 'unmatched', 0.8),
      (${s3[0].id}, '91001-KZR-600 Laher', 5, 'pcs', 81400, 407000, 'unmatched', 0.8),
      (${s3[0].id}, '11002-KVB-930', 5, 'pcs', 67672, 338360, 'uncertain', 0.6),
      (${s3[0].id}, '12251-K56-N02 P. Gasket', 20, 'pcs', 17160, 343200, 'uncertain', 0.6)
  `;

  const s4 = await sql`
    INSERT INTO receipts (receipt_type, customer_id, merchant_name, customer_name, receipt_date,
      declared_total, computed_total, currency, status, confidence)
    VALUES ('supplier', ${hondaJayaPBulan.id}, 'Honda Jaya', 'Honda Jaya P. Bulan',
      '2026-05-20', 4781630, 4781630, 'IDR', 'approved', 0.85)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, raw_description, quantity, unit, unit_price, total_price, match_status, confidence)
    VALUES
      (${s4[0].id}, '22011-K81-N00', 100, 'pcs', 16720, 1672000, 'unmatched', 0.8),
      (${s4[0].id}, '50550-K28-A00', 1, 'pcs', 40480, 40480, 'unmatched', 0.8),
      (${s4[0].id}, '20A-WE762-01', 2, 'pcs', 131580, 263160, 'unmatched', 0.8),
      (${s4[0].id}, '20A-VF01A-10', 2, 'pcs', 291540, 583080, 'unmatched', 0.8),
      (${s4[0].id}, '11111-KVB-903', 2, 'pcs', 127600, 255200, 'unmatched', 0.8)
  `;

  const s5 = await sql`
    INSERT INTO receipts (receipt_type, customer_id, merchant_name, customer_name, receipt_date,
      declared_total, computed_total, currency, status, confidence)
    VALUES ('supplier', ${asokaJaya.id}, 'Asoka Jaya', 'Asoka Jaya P.Siantar',
      '2026-05-28', 15039300, 15039300, 'IDR', 'approved', 0.85)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, raw_description, quantity, unit, unit_price, total_price, match_status, confidence)
    VALUES
      (${s5[0].id}, 'H103-KYB-980 Bos klep In', 20, 'pcs', 15400, 308000, 'unmatched', 0.8),
      (${s5[0].id}, 'Oli MPX1 0.8', 24, 'bottle', 58500, 1404000, 'unmatched', 0.8),
      (${s5[0].id}, 'Oli MPX2 0.65', 24, 'bottle', 51150, 1227600, 'unmatched', 0.8),
      (${s5[0].id}, 'Oli SPX2 0.8', 24, 'bottle', 72500, 1740000, 'unmatched', 0.8),
      (${s5[0].id}, 'Oli Gardan Matic 24x5=120', 120, 'bottle', 42500, 5100000, 'unmatched', 0.8),
      (${s5[0].id}, 'Oli Yamalube Sport 24x1=24', 24, 'bottle', 57500, 1380000, 'unmatched', 0.8),
      (${s5[0].id}, '5BP-F6111-00 Sarang', 10, 'pcs', 122550, 1225500, 'uncertain', 0.6)
  `;

  const s6 = await sql`
    INSERT INTO receipts (receipt_type, customer_id, merchant_name, customer_name, receipt_date,
      declared_total, computed_total, currency, status, confidence)
    VALUES ('supplier', ${hondaJaya.id}, 'Honda Jaya', 'Honda Jaya',
      '2026-06-09', 2957750, 2957750, 'IDR', 'approved', 0.80)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, raw_description, quantity, unit, unit_price, total_price, match_status, confidence)
    VALUES
      (${s6[0].id}, 'Stut Keteng Satria/Smash Assy', 1, 'set', 310000, 310000, 'unmatched', 0.75),
      (${s6[0].id}, '15421-KPP-900', 20, 'pcs', 1760, 35200, 'unmatched', 0.7),
      (${s6[0].id}, '12251-E2119-00 O Ring Klep', 20, 'pcs', 10750, 215000, 'unmatched', 0.7),
      (${s6[0].id}, '13121-K81-P00 Piston Kit', 2, 'set', 100320, 200640, 'unmatched', 0.75),
      (${s6[0].id}, '2PH-E6301-01 Tali Gas', 1, 'pcs', 131580, 131580, 'unmatched', 0.75),
      (${s6[0].id}, '2PH-E7653-01 Kuku Pulley Roll', 50, 'pcs', 9890, 494500, 'unmatched', 0.7)
  `;

  const s7 = await sql`
    INSERT INTO receipts (receipt_type, customer_id, merchant_name, customer_name, receipt_date,
      declared_total, computed_total, currency, status, confidence)
    VALUES ('supplier', ${hondaJayaPBulan.id}, 'Honda Jaya', 'Honda Jaya P. Bulan',
      '2026-05-29', 3975880, 3975880, 'IDR', 'approved', 0.85)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, raw_description, quantity, unit, unit_price, total_price, match_status, confidence)
    VALUES
      (${s7[0].id}, '52400-K59-A11 Sck blk', 3, 'pcs', 220880, 662640, 'unmatched', 0.8),
      (${s7[0].id}, 'Oli Federal 0.8 24x2=48', 48, 'bottle', 46000, 2208000, 'unmatched', 0.85),
      (${s7[0].id}, '37800-K0W-N81', 1, 'pcs', 54120, 54120, 'uncertain', 0.6),
      (${s7[0].id}, '93102-24802', 20, 'pcs', 12470, 249400, 'unmatched', 0.8)
  `;

  const s8 = await sql`
    INSERT INTO receipts (receipt_type, customer_id, merchant_name, customer_name, receipt_date,
      declared_total, computed_total, currency, status, confidence)
    VALUES ('supplier', ${hondaJaya.id}, 'Honda Jaya', 'Honda Jaya',
      '2024-06-03', 2873940, 2873940, 'IDR', 'approved', 0.85)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, raw_description, quantity, unit, unit_price, total_price, match_status, confidence)
    VALUES
      (${s8[0].id}, '2PA-E7663-01 Kuku Ruma Roler', 6, 'pcs', 9890, 59340, 'unmatched', 0.75),
      (${s8[0].id}, '2PA-WF662-01 Sepatu kld', 3, 'set', 165120, 495360, 'unmatched', 0.8),
      (${s8[0].id}, '17910-K59-A12', 2, 'pcs', 90200, 180400, 'unmatched', 0.8),
      (${s8[0].id}, '14500-KVZ-900', 10, 'pcs', 44440, 444400, 'unmatched', 0.8),
      (${s8[0].id}, '91005-KVB-N50', 10, 'pcs', 35112, 351120, 'unmatched', 0.8),
      (${s8[0].id}, 'Laher HB6204', 3, 'pcs', 24200, 72600, 'unmatched', 0.7)
  `;

  const s9 = await sql`
    INSERT INTO receipts (receipt_type, customer_id, merchant_name, customer_name, receipt_date,
      declared_total, computed_total, currency, status, confidence)
    VALUES ('supplier', ${hasanJaya.id}, 'Amar', 'Hasan Jaya P. Baru',
      '2026-05-26', 28716340, 28716340, 'IDR', 'approved', 0.80)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, raw_description, quantity, unit, unit_price, total_price, match_status, confidence)
    VALUES
      (${s9[0].id}, 'Oli MPX 2 AS 24x5=120', 120, 'bottle', 60000, 7200000, 'unmatched', 0.8),
      (${s9[0].id}, 'Oli MPX 1 L 24x1=24', 24, 'bottle', 76300, 1831200, 'unmatched', 0.8),
      (${s9[0].id}, 'Ban dlm 90/90x14 Hmp TL', 5, 'pcs', 227920, 1139600, 'unmatched', 0.8),
      (${s9[0].id}, '2P0-E7641-00 Tali Kopling', 3, 'pcs', 124700, 374100, 'unmatched', 0.8),
      (${s9[0].id}, '16450-K15-901 Injektor', 20, 'pcs', 99880, 1997600, 'uncertain', 0.6),
      (${s9[0].id}, '16450-K25-901', 20, 'pcs', 230560, 4611200, 'uncertain', 0.6),
      (${s9[0].id}, '30510-KGS-901 Koil', 20, 'pcs', 79200, 1584000, 'unmatched', 0.8),
      (${s9[0].id}, '17211-K18-900 S. Hawa', 20, 'pcs', 51912, 1038240, 'unmatched', 0.75),
      (${s9[0].id}, 'Oli Mesin 40', 40, 'bottle', 45300, 1812000, 'unmatched', 0.8),
      (${s9[0].id}, 'Oli Mesin Super', 40, 'bottle', 46000, 1840000, 'unmatched', 0.8),
      (${s9[0].id}, 'Oli Prima XP', 12, 'bottle', 50200, 602400, 'unmatched', 0.8)
  `;

  const s10 = await sql`
    INSERT INTO receipts (receipt_type, customer_id, merchant_name, customer_name, receipt_date,
      declared_total, computed_total, currency, status, confidence)
    VALUES ('supplier', ${hondaJayaPSiantar.id}, 'Honda Jaya', 'Hover Jaya P.Siantar',
      '2026-06-06', 8607620, 8607620, 'IDR', 'approved', 0.80)
    RETURNING id
  `;

  await sql`
    INSERT INTO line_items (receipt_id, raw_description, quantity, unit, unit_price, total_price, match_status, confidence)
    VALUES
      (${s10[0].id}, '48150-KZL-980 Han kop slk', 10, 'pcs', 47305, 473050, 'uncertain', 0.6),
      (${s10[0].id}, '2601-KVR-AM1 Vbelt slk', 2, 'pcs', 367180, 734360, 'unmatched', 0.7),
      (${s10[0].id}, '91208-K50-003 Oli slk', 20, 'pcs', 6160, 123200, 'unmatched', 0.7),
      (${s10[0].id}, 'Busi Kharisma', 2, 'pcs', 438600, 877200, 'unmatched', 0.8),
      (${s10[0].id}, '14401-KPH-901 Rantai', 5, 'pcs', 79640, 398200, 'unmatched', 0.8),
      (${s10[0].id}, 'YOA EXB00 Oli 24x3=72', 72, 'bottle', 32500, 2340000, 'unmatched', 0.8),
      (${s10[0].id}, '34906-GB6-921 Blb Stop', 30, 'pcs', 12150, 364500, 'unmatched', 0.75),
      (${s10[0].id}, '34901-KFV-651 B.dpn', 70, 'pcs', 16200, 1134000, 'unmatched', 0.75),
      (${s10[0].id}, '32102-K81-N00 Kabel Body', 2, 'pcs', 311960, 623920, 'unmatched', 0.75)
  `;

  // ── Stock Ledger entries (only approved buyer receipts) ─────────────────
  const stockIns = [
    { skuId: oliCycleMatic.id, receiptId: r1[0].id, quantity: 30, unitPrice: 864000 },
    { skuId: qtcUniOil.id, receiptId: r2[0].id, quantity: 240, unitPrice: 47000 },
    { skuId: oliMpx2.id, receiptId: r3[0].id, quantity: 648, unitPrice: 59860 },
    { skuId: brakeFluid.id, receiptId: r4[0].id, quantity: 10, unitPrice: 192000 },
    { skuId: radiatorCoolant.id, receiptId: r4[0].id, quantity: 20, unitPrice: 140000 },
    { skuId: ircNr92.id, receiptId: r6[0].id, quantity: 5, unitPrice: 260000 },
    { skuId: ircReborn.id, receiptId: r6[0].id, quantity: 5, unitPrice: 218000 },
    { skuId: ircNf25.id, receiptId: r6[0].id, quantity: 20, unitPrice: 425000 },
    { skuId: ircRx01.id, receiptId: r6[0].id, quantity: 5, unitPrice: 419000 },
    { skuId: hondaFrontTire.id, receiptId: r7[0].id, quantity: 5, unitPrice: 405000 },
    { skuId: hondaFrontTire.id, receiptId: r9[0].id, quantity: 57, unitPrice: 287000 },
    { skuId: hondaFrontTire.id, receiptId: r9[0].id, quantity: 50, unitPrice: 320000 },
  ];

  let runningBalance = 0;
  for (const entry of stockIns) {
    runningBalance += entry.quantity;
    await sql`
      INSERT INTO stock_ledger (sku_id, receipt_id, movement_type, quantity, unit_price, running_balance, notes)
      VALUES (${entry.skuId}, ${entry.receiptId}, 'in', ${entry.quantity}, ${entry.unitPrice},
        ${runningBalance}, 'Stock in from buyer receipt #${String(entry.receiptId)}')
    `;
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const counts = await sql`
    SELECT
      (SELECT COUNT(*) FROM receipts WHERE receipt_type = 'buyer') as buyer_count,
      (SELECT COUNT(*) FROM receipts WHERE receipt_type = 'supplier') as supplier_count,
      (SELECT COUNT(*) FROM flags WHERE resolved = 0) as open_flags,
      (SELECT COUNT(*) FROM skus) as sku_count,
      (SELECT SUM(running_balance) FROM stock_ledger) as total_stock
  `;

  console.log("\n✅ Seed complete!");
  console.log(`   Buyer receipts:     ${counts[0].buyer_count}`);
  console.log(`   Supplier receipts:  ${counts[0].supplier_count}`);
  console.log(`   Open flags:         ${counts[0].open_flags}`);
  console.log(`   SKUs:               ${counts[0].sku_count}`);
  console.log(`   Total stock units:  ${counts[0].total_stock ?? 0}`);

  await sql.end();
}

main().catch(async (err) => {
  console.error("❌ Seed failed:", err);
  await sql.end();
  process.exit(1);
});

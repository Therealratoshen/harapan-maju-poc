/**
 * Seed script — loads all 20 receipts into the database
 * Run: npx tsx scripts/seed.ts
 */
import { db, schema } from "../src/lib/db";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding database...");

  // Clear existing data
  await db.delete(schema.flags);
  await db.delete(schema.lineItems);
  await db.delete(schema.receipts);
  await db.delete(schema.skus);
  await db.delete(schema.customers);
  await db.delete(schema.suppliers);

  // ─── Suppliers ────────────────────────────────────────────────────────────────
  const [capella, pancaJaya, indako, mm, centralMotor] = await db
    .insert(schema.suppliers)
    .values([
      { name: "PT Capella Patria Utama", type: "buyer", address: "Medan" },
      { name: "Panca Jaya", type: "buyer", address: "Medan" },
      { name: "Indako", type: "buyer", address: "Medan" },
      { name: "MM", type: "buyer", address: "Medan" },
      { name: "Central Motor (CM)", type: "buyer", address: "Medan" },
    ])
    .returning();

  // ─── Customers ──────────────────────────────────────────────────────────────
  const [kharismaJaya, hondaJayaPBulan, hondaJayaPSiantar, hondaJaya,
    hasanJaya, asokaJaya] = await db
    .insert(schema.customers)
    .values([
      { name: "Kharisma Jaya", branch: "P. Bulan" },
      { name: "Honda Jaya", branch: "P. Bulan" },
      { name: "Honda Jaya", branch: "P. Siantar" },
      { name: "Honda Jaya", branch: "" },
      { name: "Hasan Jaya", branch: "P. Baru" },
      { name: "Asoka Jaya", branch: "P. Siantar" },
    ])
    .returning();

  // ─── SKUs ──────────────────────────────────────────────────────────────────
  const [oliCycleMatic, qtcUniOil, oliMpx2, brakeFluid, radiatorCoolant,
    ircNr92, ircReborn, ircNf25, ircRx01, hondaFrontTire] = await db
    .insert(schema.skus)
    .values([
      { normalizedName: "Cycle Matic 4T 20W-40 0.8L", category: "oil", unit: "liter", purchasePriceAvg: 36000 },
      { normalizedName: "QTC UNI Oil 20/50 0.8L", category: "oil", unit: "liter", purchasePriceAvg: 47000 },
      { normalizedName: "Honda Oli MPX2 10W30 0.8L", category: "oil", unit: "liter", purchasePriceAvg: 59860 },
      { normalizedName: "Oplus Wanz Brake Fluid 300ml", category: "brake", unit: "pcs", purchasePriceAvg: 192000 },
      { normalizedName: "XTP Radiator Coolant 1L", category: "coolant", unit: "pcs", purchasePriceAvg: 140000 },
      { normalizedName: "IRC NR 92 TL 70/90-17", category: "tire", unit: "pcs", purchasePriceAvg: 260000 },
      { normalizedName: "IRC REBORN NR 87 TL 90/80-14", category: "tire", unit: "pcs", purchasePriceAvg: 218000 },
      { normalizedName: "IRC NF 25 TL 80/100-17", category: "tire", unit: "pcs", purchasePriceAvg: 425000 },
      { normalizedName: "IRC RX-01 RTL 140/70-17", category: "tire", unit: "pcs", purchasePriceAvg: 419000 },
      { normalizedName: "Honda TIRE FR TL 110/80-14", category: "tire", unit: "pcs", purchasePriceAvg: 405000 },
    ])
    .returning();

  // ─── BUYER RECEIPTS (B1–B10) ───────────────────────────────────────────────

  // B1: PT Capella — 10 Jun 2022
  const [r1] = await db.insert(schema.receipts).values({
    receiptType: "buyer",
    supplierId: capella.id,
    merchantName: "PT Capella Patria Utama",
    customerName: "EDDY",
    invoiceNumber: "FK. 202206_02334",
    receiptDate: new Date("2022-06-10"),
    dueDate: new Date("2022-06-10"),
    subtotal: 25920000,
    discount: 1440000,
    taxAmount: 2425946,
    declaredTotal: 24480000,
    computedTotal: 25920000,
    currency: "IDR",
    status: "approved",
    confidence: 0.95,
  }).returning();

  await db.insert(schema.lineItems).values({
    receiptId: r1.id,
    skuId: oliCycleMatic.id,
    rawDescription: "CYCLE MATIC 4T 20W-40 24x0.8L",
    normalizedDescription: "Cycle Matic 4T 20W-40 0.8L",
    quantity: 30,
    unit: "carton",
    unitPrice: 864000,
    totalPrice: 25920000,
    matchStatus: "matched",
    confidence: 0.9,
  });

  await db.insert(schema.flags).values({
    receiptId: r1.id,
    flagType: "MATH_ERROR",
    message: `Computed total (Rp 25,920,000) differs from declared total (Rp 24,480,000) — likely DPP/PPN already deducted. Approved manually.`,
  });

  // B2: Panca Jaya — 11 Jun 2026
  const [r2] = await db.insert(schema.receipts).values({
    receiptType: "buyer",
    supplierId: pancaJaya.id,
    merchantName: "Panca Jaya",
    customerName: "Harapan Maju",
    invoiceNumber: "MBR/093826",
    receiptDate: new Date("2026-06-11"),
    dueDate: new Date("2026-06-18"),
    subtotal: 11280000,
    declaredTotal: 11280000,
    computedTotal: 11280000,
    currency: "IDR",
    status: "approved",
    confidence: 0.95,
  }).returning();

  await db.insert(schema.lineItems).values({
    receiptId: r2.id,
    skuId: qtcUniOil.id,
    rawDescription: "QTC UNI OIL 20/50 (24 x 800ML)",
    normalizedDescription: "QTC UNI Oil 20/50 0.8L",
    quantity: 240,
    unit: "bottle",
    unitPrice: 47000,
    totalPrice: 11280000,
    matchStatus: "matched",
    confidence: 0.95,
  });

  // B3: Indako — 04 Jun 2026
  const [r3] = await db.insert(schema.receipts).values({
    receiptType: "buyer",
    supplierId: indako.id,
    merchantName: "Indako",
    customerName: "CV. Harapan Maju",
    invoiceNumber: "079810/FAK-PD/W/06/2026",
    receiptDate: new Date("2026-06-04"),
    dueDate: new Date("2026-06-04"),
    subtotal: 38782800,
    declaredTotal: 38782800,
    computedTotal: 38782800,
    currency: "IDR",
    status: "approved",
    confidence: 0.9,
  }).returning();

  await db.insert(schema.lineItems).values({
    receiptId: r3.id,
    skuId: oliMpx2.id,
    rawDescription: "OLI MPX2 10W30 SL 0.8L FED",
    normalizedDescription: "Honda Oli MPX2 10W30 0.8L",
    quantity: 648,
    unit: "bottle",
    unitPrice: 59860,
    totalPrice: 38782800,
    matchStatus: "matched",
    confidence: 0.9,
  });

  // B4: MM — 11 Jun 2026
  const [r4] = await db.insert(schema.receipts).values({
    receiptType: "buyer",
    supplierId: mm.id,
    merchantName: "MM",
    customerName: "Harapan Maju",
    invoiceNumber: "083063",
    receiptDate: new Date("2026-06-11"),
    subtotal: 4720000,
    declaredTotal: 4720000,
    computedTotal: 4720000,
    currency: "IDR",
    status: "approved",
    confidence: 0.9,
  }).returning();

  await db.insert(schema.lineItems).values([
    {
      receiptId: r4.id,
      skuId: brakeFluid.id,
      rawDescription: "Oplus Wanz Brake Fluid - Merah (300 ml)",
      quantity: 10,
      unit: "box",
      unitPrice: 192000,
      totalPrice: 1920000,
      matchStatus: "unmatched",
      confidence: 0.85,
    },
    {
      receiptId: r4.id,
      skuId: radiatorCoolant.id,
      rawDescription: "XTP Radiator Coolant - Hijau (1 Ltr)",
      quantity: 20,
      unit: "box",
      unitPrice: 140000,
      totalPrice: 2800000,
      matchStatus: "unmatched",
      confidence: 0.85,
    },
  ]);

  // B5: CVS — 06 May 2024 (foreign currency — filtered)
  const [r5] = await db.insert(schema.receipts).values({
    receiptType: "buyer",
    merchantName: "CVS/pharmacy",
    customerName: "Full House",
    receiptDate: new Date("2024-05-06"),
    declaredTotal: 9.28,
    computedTotal: 9.28,
    currency: "USD",
    status: "flagged",
    confidence: 1.0,
  }).returning();

  await db.insert(schema.flags).values({
    receiptId: r5.id,
    flagType: "FOREIGN_CURRENCY",
    message: "Receipt is in USD — personal purchase, not included in inventory calculations",
  });

  // B6: Central Motor — 12 Jun 2026
  const [r6] = await db.insert(schema.receipts).values({
    receiptType: "buyer",
    supplierId: centralMotor.id,
    merchantName: "Central Motor (CM)",
    customerName: "Setia Budi",
    invoiceNumber: "0626/JL/2115",
    receiptDate: new Date("2026-06-12"),
    dueDate: new Date("2026-07-12"),
    subtotal: 8946500,
    discount: 4028450,
    declaredTotal: 8966500,
    computedTotal: 12994950,
    currency: "IDR",
    status: "flagged",
    confidence: 0.8,
  }).returning();

  await db.insert(schema.lineItems).values([
    { receiptId: r6.id, skuId: ircNr92.id, rawDescription: "IRC NR 92 TL 70/90 - 17", quantity: 5, unit: "pcs", unitPrice: 260000, totalPrice: 1300000, matchStatus: "matched", confidence: 0.9 },
    { receiptId: r6.id, skuId: ircReborn.id, rawDescription: "IRC REBORN NR 87 TL 90/80-14", quantity: 5, unit: "pcs", unitPrice: 218000, totalPrice: 1090000, matchStatus: "matched", confidence: 0.9 },
    { receiptId: r6.id, skuId: ircNf25.id, rawDescription: "IRC NF 25 TL 80/100 - 17", quantity: 20, unit: "pcs", unitPrice: 425000, totalPrice: 8500000, matchStatus: "matched", confidence: 0.9 },
    { receiptId: r6.id, skuId: ircRx01.id, rawDescription: "IRC RX-01 RTL 140/70 - 17", quantity: 5, unit: "pcs", unitPrice: 419000, totalPrice: 2095000, matchStatus: "matched", confidence: 0.9 },
  ]);

  await db.insert(schema.flags).values({
    receiptId: r6.id,
    flagType: "MATH_ERROR",
    message: `Computed total (Rp 12,994,950) ≠ declared total (Rp 8,966,500). 31% discount applied. Approved manually.`,
  });

  // B7: Indako — 10 Jun 2026
  const [r7] = await db.insert(schema.receipts).values({
    receiptType: "buyer",
    supplierId: indako.id,
    merchantName: "Indako",
    customerName: "CV. Harapan Maju",
    invoiceNumber: "082861/FAK-PO/M/06/2026",
    receiptDate: new Date("2026-06-10"),
    dueDate: new Date("2026-07-10"),
    subtotal: 1468125,
    declaredTotal: 1468125,
    computedTotal: 1468125,
    currency: "IDR",
    status: "approved",
    confidence: 0.9,
  }).returning();

  await db.insert(schema.lineItems).values({
    receiptId: r7.id,
    skuId: hondaFrontTire.id,
    rawDescription: "TIRE FR TL (110/80-14)",
    partNumber: "44711K0WNO1",
    quantity: 5,
    unit: "pcs",
    unitPrice: 405000,
    totalPrice: 1468125,
    matchStatus: "matched",
    confidence: 0.9,
  });

  // B8: Partial receipt — 12 Jun 2026
  const [r8] = await db.insert(schema.receipts).values({
    receiptType: "buyer",
    merchantName: "Unknown",
    customerName: "Harapan Maju",
    receiptDate: new Date("2026-06-12"),
    declaredTotal: 8050300,
    computedTotal: 0,
    currency: "IDR",
    status: "flagged",
    confidence: 0.4,
    notes: "Partial receipt — several items unreadable. Needs manual review.",
  }).returning();

  await db.insert(schema.flags).values({
    receiptId: r8.id,
    flagType: "LOW_CONFIDENCE",
    message: "Receipt image quality is poor — line items partially unreadable. Manual entry required.",
  });

  // B9: Indako — 05 Jun 2026
  const [r9] = await db.insert(schema.receipts).values({
    receiptType: "buyer",
    supplierId: indako.id,
    merchantName: "Indako",
    customerName: "CV. Harapan Maju",
    invoiceNumber: "081321/FAK-PD/W/06/2026",
    receiptDate: new Date("2026-06-05"),
    dueDate: new Date("2026-07-05"),
    subtotal: 23460275,
    declaredTotal: 23460275,
    computedTotal: 23460275,
    currency: "IDR",
    status: "approved",
    confidence: 0.9,
  }).returning();

  await db.insert(schema.lineItems).values([
    { receiptId: r9.id, skuId: hondaFrontTire.id, rawDescription: "TIRE FR TL (80/90-14)", partNumber: "44711K59A12", quantity: 57, unit: "pcs", unitPrice: 287000, totalPrice: 11860275, matchStatus: "matched", confidence: 0.9 },
    { receiptId: r9.id, skuId: hondaFrontTire.id, rawDescription: "TIRE RR TL (90/90-14)", partNumber: "42711K59A12", quantity: 50, unit: "pcs", unitPrice: 320000, totalPrice: 11600000, matchStatus: "matched", confidence: 0.9 },
  ]);

  // B10: Metro — 15 May 2024 (foreign — filtered)
  const [r10] = await db.insert(schema.receipts).values({
    receiptType: "buyer",
    merchantName: "Metro",
    customerName: "Full House",
    receiptDate: new Date("2024-05-15"),
    declaredTotal: 61.32,
    computedTotal: 61.32,
    currency: "CAD",
    status: "flagged",
    confidence: 1.0,
  }).returning();

  await db.insert(schema.flags).values({
    receiptId: r10.id,
    flagType: "FOREIGN_CURRENCY",
    message: "Receipt is in CAD — personal grocery purchase, not included in inventory calculations",
  });

  // ─── SUPPLIER RECEIPTS (S1–S10) ────────────────────────────────────────────

  // S1: Anugrah / Kharisma Jaya — 26 May 2026
  const [s1] = await db.insert(schema.receipts).values({
    receiptType: "supplier",
    customerId: kharismaJaya.id,
    merchantName: "Anugrah",
    customerName: "Kharisma Jaya",
    receiptDate: new Date("2026-05-26"),
    subtotal: 16247100,
    declaredTotal: 19247700, // manual correction noted
    computedTotal: 16310100,
    currency: "IDR",
    status: "flagged",
    confidence: 0.75,
    notes: "Manual total correction noted — computed Rp 16,310,100 vs declared Rp 19,247,700",
  }).returning();

  await db.insert(schema.lineItems).values([
    { receiptId: s1.id, rawDescription: "Oli Yamalube Silver 24x0.8L", quantity: 48, unit: "bottle", unitPrice: 45650, totalPrice: 2191200, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s1.id, rawDescription: "Oli Super Matic 24x1", quantity: 24, unit: "bottle", unitPrice: 71000, totalPrice: 1704000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s1.id, rawDescription: "Oli MPX1 0.8", quantity: 24, unit: "bottle", unitPrice: 58500, totalPrice: 1404000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s1.id, rawDescription: "Oli Gear Matic 150ml", quantity: 48, unit: "bottle", unitPrice: 18750, totalPrice: 900000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s1.id, rawDescription: "94416-17894", quantity: 5, unit: "pcs", unitPrice: 153000, totalPrice: 765000, matchStatus: "uncertain", confidence: 0.6 },
    { receiptId: s1.id, rawDescription: "Oli SPX2 0.8 12x0.8", quantity: 36, unit: "bottle", unitPrice: 48000, totalPrice: 1728000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s1.id, rawDescription: "Oli AX5 12x1=12", quantity: 12, unit: "bottle", unitPrice: 59200, totalPrice: 710400, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s1.id, rawDescription: "Oli AX5 Matic 12x0.8=36", quantity: 36, unit: "bottle", unitPrice: 53600, totalPrice: 1929600, matchStatus: "unmatched", confidence: 0.8 },
  ]);

  await db.insert(schema.flags).values([
    { receiptId: s1.id, flagType: "MATH_ERROR", message: "Computed line item sum (Rp 16,310,100) ≠ declared total (Rp 19,247,700). Variance: Rp 2,937,600. Awaiting manual review." },
    { receiptId: s1.id, flagType: "MISSING_INVOICE_NO", message: "No invoice number on receipt" },
  ]);

  // S2: Anjas / Hawa Jaya — 26 May 2026
  const [s2] = await db.insert(schema.receipts).values({
    receiptType: "supplier",
    merchantName: "Anjas",
    customerName: "Hawa Jaya",
    receiptDate: new Date("2026-05-26"),
    declaredTotal: 10922310,
    computedTotal: 10922310,
    currency: "IDR",
    status: "approved",
    confidence: 0.85,
  }).returning();

  await db.insert(schema.lineItems).values([
    { receiptId: s2.id, rawDescription: "52XV-E2603-00 Tutup Kipas", quantity: 3, unit: "pcs", unitPrice: 21070, totalPrice: 63210, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s2.id, rawDescription: "93102-24802 Oil Seal", quantity: 20, unit: "pcs", unitPrice: 12470, totalPrice: 249400, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s2.id, rawDescription: "Oli 2T PRO 20x3=60", quantity: 60, unit: "bottle", unitPrice: 71200, totalPrice: 2136000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s2.id, rawDescription: "Oli 2T EVLWB 20x3=60", quantity: 60, unit: "bottle", unitPrice: 54500, totalPrice: 1635000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s2.id, rawDescription: "131A1-K0J-N10 Piston Kit", quantity: 2, unit: "set", unitPrice: 109120, totalPrice: 218240, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s2.id, rawDescription: "Assy Jeckstm CS", quantity: 20, unit: "set", unitPrice: 188511, totalPrice: 3770220, matchStatus: "unmatched", confidence: 0.8 },
  ]);

  // S3: Honda Jaya P. Silay — 28 May 2026
  const [s3] = await db.insert(schema.receipts).values({
    receiptType: "supplier",
    customerId: hondaJayaPSiantar.id,
    merchantName: "Honda Jaya",
    customerName: "Honda Jaya P. Silay",
    receiptDate: new Date("2026-05-28"),
    declaredTotal: 7279020,
    computedTotal: 7277340,
    currency: "IDR",
    status: "flagged",
    confidence: 0.8,
    notes: "Minor variance of Rp 1,680 — likely rounding. Approved.",
  }).returning();

  await db.insert(schema.lineItems).values([
    { receiptId: s3.id, rawDescription: "Oli Federal 0.8 24x3=72", quantity: 72, unit: "bottle", unitPrice: 46000, totalPrice: 3312000, matchStatus: "unmatched", confidence: 0.85 },
    { receiptId: s3.id, rawDescription: "50C-WB01G-00 Shoe Komplit", quantity: 1, unit: "set", unitPrice: 589960, totalPrice: 589960, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s3.id, rawDescription: "91001-KZR-600 Laher", quantity: 5, unit: "pcs", unitPrice: 81400, totalPrice: 407000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s3.id, rawDescription: "11002-KVB-930", quantity: 5, unit: "pcs", unitPrice: 67672, totalPrice: 338360, matchStatus: "uncertain", confidence: 0.6 },
    { receiptId: s3.id, rawDescription: "12251-K56-N02 P. Gasket", quantity: 20, unit: "pcs", unitPrice: 17160, totalPrice: 343200, matchStatus: "uncertain", confidence: 0.6 },
  ]);

  await db.insert(schema.flags).values({
    receiptId: s3.id,
    flagType: "MATH_ERROR",
    message: "Minor variance (Rp 1,680) — likely rounding. Approved manually.",
  });

  // S4: Honda Jaya P. Bulan — 20 May 2026
  const [s4] = await db.insert(schema.receipts).values({
    receiptType: "supplier",
    customerId: hondaJayaPBulan.id,
    merchantName: "Honda Jaya",
    customerName: "Honda Jaya P. Bulan",
    receiptDate: new Date("2026-05-20"),
    declaredTotal: 4781630,
    computedTotal: 4781630,
    currency: "IDR",
    status: "approved",
    confidence: 0.85,
  }).returning();

  await db.insert(schema.lineItems).values([
    { receiptId: s4.id, rawDescription: "22011-K81-N00", quantity: 100, unit: "pcs", unitPrice: 16720, totalPrice: 1672000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s4.id, rawDescription: "50550-K28-A00", quantity: 1, unit: "pcs", unitPrice: 40480, totalPrice: 40480, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s4.id, rawDescription: "20A-WE762-01", quantity: 2, unit: "pcs", unitPrice: 131580, totalPrice: 263160, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s4.id, rawDescription: "20A-VF01A-10", quantity: 2, unit: "pcs", unitPrice: 291540, totalPrice: 583080, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s4.id, rawDescription: "11111-KVB-903", quantity: 2, unit: "pcs", unitPrice: 127600, totalPrice: 255200, matchStatus: "unmatched", confidence: 0.8 },
  ]);

  // S5: Asoka Jaya P.Siantar — 28 May 2026
  const [s5] = await db.insert(schema.receipts).values({
    receiptType: "supplier",
    customerId: asokaJaya.id,
    merchantName: "Asoka Jaya",
    customerName: "Asoka Jaya P.Siantar",
    receiptDate: new Date("2026-05-28"),
    declaredTotal: 15039300,
    computedTotal: 15039300,
    currency: "IDR",
    status: "approved",
    confidence: 0.85,
  }).returning();

  await db.insert(schema.lineItems).values([
    { receiptId: s5.id, rawDescription: "H103-KYB-980 Bos klep In", quantity: 20, unit: "pcs", unitPrice: 15400, totalPrice: 308000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s5.id, rawDescription: "Oli MPX1 0.8", quantity: 24, unit: "bottle", unitPrice: 58500, totalPrice: 1404000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s5.id, rawDescription: "Oli MPX2 0.65", quantity: 24, unit: "bottle", unitPrice: 51150, totalPrice: 1227600, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s5.id, rawDescription: "Oli SPX2 0.8", quantity: 24, unit: "bottle", unitPrice: 72500, totalPrice: 1740000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s5.id, rawDescription: "Oli Gardan Matic 24x5=120", quantity: 120, unit: "bottle", unitPrice: 42500, totalPrice: 5100000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s5.id, rawDescription: "Oli Yamalube Sport 24x1=24", quantity: 24, unit: "bottle", unitPrice: 57500, totalPrice: 1380000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s5.id, rawDescription: "5BP-F6111-00 Sarang", quantity: 10, unit: "pcs", unitPrice: 122550, totalPrice: 1225500, matchStatus: "uncertain", confidence: 0.6 },
  ]);

  // S6: Honda Jaya — 09 Jun 2026
  const [s6] = await db.insert(schema.receipts).values({
    receiptType: "supplier",
    customerId: hondaJaya.id,
    merchantName: "Honda Jaya",
    customerName: "Honda Jaya",
    receiptDate: new Date("2026-06-09"),
    declaredTotal: 2957750,
    computedTotal: 2957750,
    currency: "IDR",
    status: "approved",
    confidence: 0.8,
  }).returning();

  await db.insert(schema.lineItems).values([
    { receiptId: s6.id, rawDescription: "Stut Keteng Satria/Smash Assy", quantity: 1, unit: "set", unitPrice: 310000, totalPrice: 310000, matchStatus: "unmatched", confidence: 0.75 },
    { receiptId: s6.id, rawDescription: "15421-KPP-900", quantity: 20, unit: "pcs", unitPrice: 1760, totalPrice: 35200, matchStatus: "unmatched", confidence: 0.7 },
    { receiptId: s6.id, rawDescription: "12251-E2119-00 O Ring Klep", quantity: 20, unit: "pcs", unitPrice: 10750, totalPrice: 215000, matchStatus: "unmatched", confidence: 0.7 },
    { receiptId: s6.id, rawDescription: "13121-K81-P00 Piston Kit", quantity: 2, unit: "set", unitPrice: 100320, totalPrice: 200640, matchStatus: "unmatched", confidence: 0.75 },
    { receiptId: s6.id, rawDescription: "2PH-E6301-01 Tali Gas", quantity: 1, unit: "pcs", unitPrice: 131580, totalPrice: 131580, matchStatus: "unmatched", confidence: 0.75 },
    { receiptId: s6.id, rawDescription: "2PH-E7653-01 Kuku Pulley Roll", quantity: 50, unit: "pcs", unitPrice: 9890, totalPrice: 494500, matchStatus: "unmatched", confidence: 0.7 },
  ]);

  // S7: Honda Jaya P. Bulan — 29 May 2026
  const [s7] = await db.insert(schema.receipts).values({
    receiptType: "supplier",
    customerId: hondaJayaPBulan.id,
    merchantName: "Honda Jaya",
    customerName: "Honda Jaya P. Bulan",
    receiptDate: new Date("2026-05-29"),
    declaredTotal: 3975880,
    computedTotal: 3975880,
    currency: "IDR",
    status: "approved",
    confidence: 0.85,
  }).returning();

  await db.insert(schema.lineItems).values([
    { receiptId: s7.id, rawDescription: "52400-K59-A11 Sck blk", quantity: 3, unit: "pcs", unitPrice: 220880, totalPrice: 662640, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s7.id, rawDescription: "Oli Federal 0.8 24x2=48", quantity: 48, unit: "bottle", unitPrice: 46000, totalPrice: 2208000, matchStatus: "unmatched", confidence: 0.85 },
    { receiptId: s7.id, rawDescription: "37800-K0W-N81", quantity: 1, unit: "pcs", unitPrice: 54120, totalPrice: 54120, matchStatus: "uncertain", confidence: 0.6 },
    { receiptId: s7.id, rawDescription: "93102-24802", quantity: 20, unit: "pcs", unitPrice: 12470, totalPrice: 249400, matchStatus: "unmatched", confidence: 0.8 },
  ]);

  // S8: Honda Jaya — 03 Jun 2024
  const [s8] = await db.insert(schema.receipts).values({
    receiptType: "supplier",
    customerId: hondaJaya.id,
    merchantName: "Honda Jaya",
    customerName: "Honda Jaya",
    receiptDate: new Date("2024-06-03"),
    declaredTotal: 2873940,
    computedTotal: 2873940,
    currency: "IDR",
    status: "approved",
    confidence: 0.85,
  }).returning();

  await db.insert(schema.lineItems).values([
    { receiptId: s8.id, rawDescription: "2PA-E7663-01 Kuku Ruma Roler", quantity: 6, unit: "pcs", unitPrice: 9890, totalPrice: 59340, matchStatus: "unmatched", confidence: 0.75 },
    { receiptId: s8.id, rawDescription: "2PA-WF662-01 Sepatu kld", quantity: 3, unit: "set", unitPrice: 165120, totalPrice: 495360, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s8.id, rawDescription: "17910-K59-A12", quantity: 2, unit: "pcs", unitPrice: 90200, totalPrice: 180400, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s8.id, rawDescription: "14500-KVZ-900", quantity: 10, unit: "pcs", unitPrice: 44440, totalPrice: 444400, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s8.id, rawDescription: "91005-KVB-N50", quantity: 10, unit: "pcs", unitPrice: 35112, totalPrice: 351120, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s8.id, rawDescription: "Laher HB6204", quantity: 3, unit: "pcs", unitPrice: 24200, totalPrice: 72600, matchStatus: "unmatched", confidence: 0.7 },
  ]);

  // S9: Hasan Jaya P. Baru — 26 May 2026
  const [s9] = await db.insert(schema.receipts).values({
    receiptType: "supplier",
    customerId: hasanJaya.id,
    merchantName: "Amar",
    customerName: "Hasan Jaya P. Baru",
    receiptDate: new Date("2026-05-26"),
    declaredTotal: 28716340,
    computedTotal: 28716340,
    currency: "IDR",
    status: "approved",
    confidence: 0.8,
  }).returning();

  await db.insert(schema.lineItems).values([
    { receiptId: s9.id, rawDescription: "Oli MPX 2 AS 24x5=120", quantity: 120, unit: "bottle", unitPrice: 60000, totalPrice: 7200000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s9.id, rawDescription: "Oli MPX 1 L 24x1=24", quantity: 24, unit: "bottle", unitPrice: 76300, totalPrice: 1831200, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s9.id, rawDescription: "Ban dlm 90/90x14 Hmp TL", quantity: 5, unit: "pcs", unitPrice: 227920, totalPrice: 1139600, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s9.id, rawDescription: "2P0-E7641-00 Tali Kopling", quantity: 3, unit: "pcs", unitPrice: 124700, totalPrice: 374100, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s9.id, rawDescription: "16450-K15-901 Injektor", quantity: 20, unit: "pcs", unitPrice: 99880, totalPrice: 1997600, matchStatus: "uncertain", confidence: 0.6 },
    { receiptId: s9.id, rawDescription: "16450-K25-901", quantity: 20, unit: "pcs", unitPrice: 230560, totalPrice: 4611200, matchStatus: "uncertain", confidence: 0.6 },
    { receiptId: s9.id, rawDescription: "30510-KGS-901 Koil", quantity: 20, unit: "pcs", unitPrice: 79200, totalPrice: 1584000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s9.id, rawDescription: "17211-K18-900 S. Hawa", quantity: 20, unit: "pcs", unitPrice: 51912, totalPrice: 1038240, matchStatus: "unmatched", confidence: 0.75 },
    { receiptId: s9.id, rawDescription: "Oli Mesin 40", quantity: 40, unit: "bottle", unitPrice: 45300, totalPrice: 1812000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s9.id, rawDescription: "Oli Mesin Super", quantity: 40, unit: "bottle", unitPrice: 46000, totalPrice: 1840000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s9.id, rawDescription: "Oli Prima XP", quantity: 12, unit: "bottle", unitPrice: 50200, totalPrice: 602400, matchStatus: "unmatched", confidence: 0.8 },
  ]);

  // S10: Honda Jaya P.Siantar — 06 Jun 2026
  const [s10] = await db.insert(schema.receipts).values({
    receiptType: "supplier",
    customerId: hondaJayaPSiantar.id,
    merchantName: "Honda Jaya",
    customerName: "Hover Jaya P.Siantar",
    receiptDate: new Date("2026-06-06"),
    declaredTotal: 8607620,
    computedTotal: 8607620,
    currency: "IDR",
    status: "approved",
    confidence: 0.8,
  }).returning();

  await db.insert(schema.lineItems).values([
    { receiptId: s10.id, rawDescription: "48150-KZL-980 Han kop slk", quantity: 10, unit: "pcs", unitPrice: 47305, totalPrice: 473050, matchStatus: "uncertain", confidence: 0.6 },
    { receiptId: s10.id, rawDescription: "2601-KVR-AM1 Vbelt slk", quantity: 2, unit: "pcs", unitPrice: 367180, totalPrice: 734360, matchStatus: "unmatched", confidence: 0.7 },
    { receiptId: s10.id, rawDescription: "91208-K50-003 Oli slk", quantity: 20, unit: "pcs", unitPrice: 6160, totalPrice: 123200, matchStatus: "unmatched", confidence: 0.7 },
    { receiptId: s10.id, rawDescription: "Busi Kharisma", quantity: 2, unit: "pcs", unitPrice: 438600, totalPrice: 877200, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s10.id, rawDescription: "14401-KPH-901 Rantai", quantity: 5, unit: "pcs", unitPrice: 79640, totalPrice: 398200, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s10.id, rawDescription: "YOA EXB00 Oli 24x3=72", quantity: 72, unit: "bottle", unitPrice: 32500, totalPrice: 2340000, matchStatus: "unmatched", confidence: 0.8 },
    { receiptId: s10.id, rawDescription: "34906-GB6-921 Blb Stop", quantity: 30, unit: "pcs", unitPrice: 12150, totalPrice: 364500, matchStatus: "unmatched", confidence: 0.75 },
    { receiptId: s10.id, rawDescription: "34901-KFV-651 B.dpn", quantity: 70, unit: "pcs", unitPrice: 16200, totalPrice: 1134000, matchStatus: "unmatched", confidence: 0.75 },
    { receiptId: s10.id, rawDescription: "32102-K81-N00 Kabel Body", quantity: 2, unit: "pcs", unitPrice: 311960, totalPrice: 623920, matchStatus: "unmatched", confidence: 0.75 },
  ]);

  // ─── Stock Ledger Entries ───────────────────────────────────────────────────
  // Only for approved buyer receipts
  const stockIns = [
    { skuId: oliCycleMatic.id, receiptId: r1.id, quantity: 30, unitPrice: 864000 },
    { skuId: qtcUniOil.id, receiptId: r2.id, quantity: 240, unitPrice: 47000 },
    { skuId: oliMpx2.id, receiptId: r3.id, quantity: 648, unitPrice: 59860 },
    { skuId: brakeFluid.id, receiptId: r4.id, quantity: 10, unitPrice: 192000 },
    { skuId: radiatorCoolant.id, receiptId: r4.id, quantity: 20, unitPrice: 140000 },
    { skuId: ircNr92.id, receiptId: r6.id, quantity: 5, unitPrice: 260000 },
    { skuId: ircReborn.id, receiptId: r6.id, quantity: 5, unitPrice: 218000 },
    { skuId: ircNf25.id, receiptId: r6.id, quantity: 20, unitPrice: 425000 },
    { skuId: ircRx01.id, receiptId: r6.id, quantity: 5, unitPrice: 419000 },
    { skuId: hondaFrontTire.id, receiptId: r7.id, quantity: 5, unitPrice: 405000 },
    { skuId: hondaFrontTire.id, receiptId: r9.id, quantity: 57, unitPrice: 287000 },
    { skuId: hondaFrontTire.id, receiptId: r9.id, quantity: 50, unitPrice: 320000 },
  ];

  let runningBalance = 0;
  for (const entry of stockIns) {
    runningBalance += entry.quantity;
    await db.insert(schema.stockLedger).values({
      skuId: entry.skuId,
      receiptId: entry.receiptId,
      movementType: "in",
      quantity: entry.quantity,
      unitPrice: entry.unitPrice,
      runningBalance,
    });
  }

  console.log("✅ Seed complete!");
  console.log("  - 5 suppliers");
  console.log("  - 6 customers");
  console.log("  - 10 SKUs");
  console.log("  - 10 buyer receipts");
  console.log("  - 10 supplier receipts");
  console.log("  - Stock ledger entries");
  console.log("  - Flags on receipts with math errors / foreign currency");
}

seed().catch(console.error);

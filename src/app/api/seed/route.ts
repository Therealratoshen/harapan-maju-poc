/**
 * POST /api/seed
 *
 * Seeds the live database with realistic Indonesian spare parts receipts.
 * Call this ONCE after connecting a database. Safe to run multiple times (clears existing data).
 *
 * Usage: curl -X POST https://harapan-maju-poc.vercel.app/api/seed
 */

import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function POST() {
  try {
    // Clear existing data
    await db.delete(schema.stockLedger);
    await db.delete(schema.flags);
    await db.delete(schema.lineItems);
    await db.delete(schema.receipts);
    await db.delete(schema.skus);
    await db.delete(schema.customers);
    await db.delete(schema.suppliers);

    // ── Suppliers ─────────────────────────────────────────────────────────
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

    // ── Customers ───────────────────────────────────────────────────────
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

    // ── SKUs ────────────────────────────────────────────────────────────
    const skus = await db.insert(schema.skus).values([
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
    ]).returning();

    const [oliCycleMatic, qtcUniOil, oliMpx2, brakeFluid, radiatorCoolant,
      ircNr92, ircReborn, ircNf25, ircRx01, hondaFrontTire] = skus;

    // ── BUYER RECEIPTS ─────────────────────────────────────────────────

    // B1: PT Capella — 10 Jun 2022
    const [r1] = await db.insert(schema.receipts).values({
      receiptType: "buyer", supplierId: capella.id,
      merchantName: "PT Capella Patria Utama", customerName: "EDDY",
      invoiceNumber: "FK. 202206_02334",
      receiptDate: new Date("2022-06-10"), dueDate: new Date("2022-06-10"),
      subtotal: 25920000, discount: 1440000, taxAmount: 2425946,
      declaredTotal: 24480000, computedTotal: 25920000,
      currency: "IDR", status: "approved", confidence: 0.95,
    }).returning();

    await db.insert(schema.lineItems).values({
      receiptId: r1.id, skuId: oliCycleMatic.id,
      rawDescription: "CYCLE MATIC 4T 20W-40 24x0.8L",
      normalizedDescription: "Cycle Matic 4T 20W-40 0.8L",
      quantity: 30, unit: "carton", unitPrice: 864000, totalPrice: 25920000,
      matchStatus: "matched", confidence: 0.9,
    });

    await db.insert(schema.flags).values({
      receiptId: r1.id, flagType: "MATH_ERROR",
      message: "Computed total (Rp 25,920,000) differs from declared total (Rp 24,480,000) — likely DPP/PPN already deducted. Approved manually.",
    });

    // B2: Panca Jaya — 11 Jun 2026
    const [r2] = await db.insert(schema.receipts).values({
      receiptType: "buyer", supplierId: pancaJaya.id,
      merchantName: "Panca Jaya", customerName: "Harapan Maju",
      invoiceNumber: "MBR/093826",
      receiptDate: new Date("2026-06-11"), dueDate: new Date("2026-06-18"),
      subtotal: 11280000, declaredTotal: 11280000, computedTotal: 11280000,
      currency: "IDR", status: "approved", confidence: 0.95,
    }).returning();

    await db.insert(schema.lineItems).values({
      receiptId: r2.id, skuId: qtcUniOil.id,
      rawDescription: "QTC UNI OIL 20/50 (24 x 800ML)",
      normalizedDescription: "QTC UNI Oil 20/50 0.8L",
      quantity: 240, unit: "bottle", unitPrice: 47000, totalPrice: 11280000,
      matchStatus: "matched", confidence: 0.95,
    });

    // B3: Indako — 04 Jun 2026
    const [r3] = await db.insert(schema.receipts).values({
      receiptType: "buyer", supplierId: indako.id,
      merchantName: "Indako", customerName: "CV. Harapan Maju",
      invoiceNumber: "079810/FAK-PD/W/06/2026",
      receiptDate: new Date("2026-06-04"), dueDate: new Date("2026-06-04"),
      subtotal: 38782800, declaredTotal: 38782800, computedTotal: 38782800,
      currency: "IDR", status: "approved", confidence: 0.9,
    }).returning();

    await db.insert(schema.lineItems).values({
      receiptId: r3.id, skuId: oliMpx2.id,
      rawDescription: "OLI MPX2 10W30 SL 0.8L FED",
      normalizedDescription: "Honda Oli MPX2 10W30 0.8L",
      quantity: 648, unit: "bottle", unitPrice: 59860, totalPrice: 38782800,
      matchStatus: "matched", confidence: 0.9,
    });

    // B4: MM — 11 Jun 2026
    const [r4] = await db.insert(schema.receipts).values({
      receiptType: "buyer", supplierId: mm.id,
      merchantName: "MM", customerName: "Harapan Maju",
      invoiceNumber: "083063",
      receiptDate: new Date("2026-06-11"),
      subtotal: 4720000, declaredTotal: 4720000, computedTotal: 4720000,
      currency: "IDR", status: "approved", confidence: 0.9,
    }).returning();

    await db.insert(schema.lineItems).values([
      { receiptId: r4.id, skuId: brakeFluid.id, rawDescription: "Oplus Wanz Brake Fluid - Merah (300 ml)", quantity: 10, unit: "box", unitPrice: 192000, totalPrice: 1920000, matchStatus: "matched", confidence: 0.85 },
      { receiptId: r4.id, skuId: radiatorCoolant.id, rawDescription: "XTP Radiator Coolant - Hijau (1 Ltr)", quantity: 20, unit: "box", unitPrice: 140000, totalPrice: 2800000, matchStatus: "matched", confidence: 0.85 },
    ]);

    // B5: CVS — USD (foreign — flagged)
    const [r5] = await db.insert(schema.receipts).values({
      receiptType: "buyer", merchantName: "CVS/pharmacy", customerName: "Full House",
      receiptDate: new Date("2024-05-06"),
      declaredTotal: 9.28, computedTotal: 9.28, currency: "USD",
      status: "flagged", confidence: 1.0,
    }).returning();

    await db.insert(schema.flags).values({
      receiptId: r5.id, flagType: "FOREIGN_CURRENCY",
      message: "Receipt is in USD — personal purchase, excluded from inventory calculations.",
    });

    // B6: Central Motor — 12 Jun 2026 (flagged: math error)
    const [r6] = await db.insert(schema.receipts).values({
      receiptType: "buyer", supplierId: centralMotor.id,
      merchantName: "Central Motor (CM)", customerName: "Setia Budi",
      invoiceNumber: "0626/JL/2115",
      receiptDate: new Date("2026-06-12"), dueDate: new Date("2026-07-12"),
      subtotal: 8946500, discount: 4028450, declaredTotal: 8966500, computedTotal: 12994950,
      currency: "IDR", status: "approved", confidence: 0.8,
    }).returning();

    await db.insert(schema.lineItems).values([
      { receiptId: r6.id, skuId: ircNr92.id, rawDescription: "IRC NR 92 TL 70/90-17", quantity: 5, unit: "pcs", unitPrice: 260000, totalPrice: 1300000, matchStatus: "matched", confidence: 0.9 },
      { receiptId: r6.id, skuId: ircReborn.id, rawDescription: "IRC REBORN NR 87 TL 90/80-14", quantity: 5, unit: "pcs", unitPrice: 218000, totalPrice: 1090000, matchStatus: "matched", confidence: 0.9 },
      { receiptId: r6.id, skuId: ircNf25.id, rawDescription: "IRC NF 25 TL 80/100-17", quantity: 20, unit: "pcs", unitPrice: 425000, totalPrice: 8500000, matchStatus: "matched", confidence: 0.9 },
      { receiptId: r6.id, skuId: ircRx01.id, rawDescription: "IRC RX-01 RTL 140/70-17", quantity: 5, unit: "pcs", unitPrice: 419000, totalPrice: 2095000, matchStatus: "matched", confidence: 0.9 },
    ]);

    await db.insert(schema.flags).values({
      receiptId: r6.id, flagType: "MATH_ERROR",
      message: "Computed total (Rp 12,994,950) ≠ declared total (Rp 8,966,500). 31% discount applied. Approved manually.",
    });

    // B7: Indako — 10 Jun 2026
    const [r7] = await db.insert(schema.receipts).values({
      receiptType: "buyer", supplierId: indako.id,
      merchantName: "Indako", customerName: "CV. Harapan Maju",
      invoiceNumber: "082861/FAK-PO/M/06/2026",
      receiptDate: new Date("2026-06-10"), dueDate: new Date("2026-07-10"),
      subtotal: 1468125, declaredTotal: 1468125, computedTotal: 1468125,
      currency: "IDR", status: "approved", confidence: 0.9,
    }).returning();

    await db.insert(schema.lineItems).values({
      receiptId: r7.id, skuId: hondaFrontTire.id,
      rawDescription: "TIRE FR TL (110/80-14)", partNumber: "44711K0WNO1",
      quantity: 5, unit: "pcs", unitPrice: 405000, totalPrice: 1468125,
      matchStatus: "matched", confidence: 0.9,
    });

    // B8: Partial receipt (flagged)
    const [r8] = await db.insert(schema.receipts).values({
      receiptType: "buyer", merchantName: "Unknown", customerName: "Harapan Maju",
      receiptDate: new Date("2026-06-12"),
      declaredTotal: 8050300, computedTotal: 0,
      currency: "IDR", status: "flagged", confidence: 0.4,
      notes: "Partial receipt — several items unreadable. Needs manual review.",
    }).returning();

    await db.insert(schema.flags).values({
      receiptId: r8.id, flagType: "LOW_CONFIDENCE",
      message: "Receipt image quality is poor — line items partially unreadable. Manual entry required.",
    });

    // B9: Indako — 05 Jun 2026
    const [r9] = await db.insert(schema.receipts).values({
      receiptType: "buyer", supplierId: indako.id,
      merchantName: "Indako", customerName: "CV. Harapan Maju",
      invoiceNumber: "081321/FAK-PD/W/06/2026",
      receiptDate: new Date("2026-06-05"), dueDate: new Date("2026-07-05"),
      subtotal: 23460275, declaredTotal: 23460275, computedTotal: 23460275,
      currency: "IDR", status: "approved", confidence: 0.9,
    }).returning();

    await db.insert(schema.lineItems).values([
      { receiptId: r9.id, skuId: hondaFrontTire.id, rawDescription: "TIRE FR TL (80/90-14)", partNumber: "44711K59A12", quantity: 57, unit: "pcs", unitPrice: 287000, totalPrice: 11860275, matchStatus: "matched", confidence: 0.9 },
      { receiptId: r9.id, skuId: hondaFrontTire.id, rawDescription: "TIRE RR TL (90/90-14)", partNumber: "42711K59A12", quantity: 50, unit: "pcs", unitPrice: 320000, totalPrice: 11600000, matchStatus: "matched", confidence: 0.9 },
    ]);

    // B10: Metro CAD (flagged)
    await db.insert(schema.receipts).values({
      receiptType: "buyer", merchantName: "Metro", customerName: "Full House",
      receiptDate: new Date("2024-05-15"),
      declaredTotal: 61.32, computedTotal: 61.32, currency: "CAD",
      status: "flagged", confidence: 1.0,
    });

    await db.insert(schema.flags).values({
      receiptId: (await db.select().from(schema.receipts).where(eq(schema.receipts.merchantName, "Metro")).then(r => r[0]) as any)?.id ?? 0,
      flagType: "FOREIGN_CURRENCY",
      message: "Receipt is in CAD — personal grocery purchase, excluded from inventory calculations",
    });

    // ── SUPPLIER RECEIPTS ──────────────────────────────────────────────

    const supplierReceipts = [
      {
        customerId: kharismaJaya.id, merchantName: "Anugrah", customerName: "Kharisma Jaya",
        date: "2026-05-26", total: 19247700, computedTotal: 16310100,
        status: "flagged", confidence: 0.75, notes: "Math error — variance Rp 2,937,600",
        lineItems: [
          { desc: "Oli Yamalube Silver 24x0.8L", qty: 48, unit: "bottle", price: 45650, total: 2191200 },
          { desc: "Oli Super Matic 24x1", qty: 24, unit: "bottle", price: 71000, total: 1704000 },
          { desc: "Oli MPX1 0.8", qty: 24, unit: "bottle", price: 58500, total: 1404000 },
          { desc: "Oli Gear Matic 150ml", qty: 48, unit: "bottle", price: 18750, total: 900000 },
          { desc: "94416-17894", qty: 5, unit: "pcs", price: 153000, total: 765000 },
          { desc: "Oli SPX2 0.8 12x0.8", qty: 36, unit: "bottle", price: 48000, total: 1728000 },
          { desc: "Oli AX5 12x1=12", qty: 12, unit: "bottle", price: 59200, total: 710400 },
          { desc: "Oli AX5 Matic 12x0.8=36", qty: 36, unit: "bottle", price: 53600, total: 1929600 },
        ],
      },
      {
        merchantName: "Anjas", customerName: "Hawa Jaya",
        date: "2026-05-26", total: 10922310, computedTotal: 10922310,
        status: "approved", confidence: 0.85,
        lineItems: [
          { desc: "52XV-E2603-00 Tutup Kipas", qty: 3, unit: "pcs", price: 21070, total: 63210 },
          { desc: "93102-24802 Oil Seal", qty: 20, unit: "pcs", price: 12470, total: 249400 },
          { desc: "Oli 2T PRO 20x3=60", qty: 60, unit: "bottle", price: 71200, total: 2136000 },
          { desc: "Oli 2T EVLWB 20x3=60", qty: 60, unit: "bottle", price: 54500, total: 1635000 },
          { desc: "131A1-K0J-N10 Piston Kit", qty: 2, unit: "set", price: 109120, total: 218240 },
          { desc: "Assy Jeckstm CS", qty: 20, unit: "set", price: 188511, total: 3770220 },
        ],
      },
      {
        customerId: hondaJayaPSiantar.id, merchantName: "Honda Jaya", customerName: "Honda Jaya P. Siantar",
        date: "2026-05-28", total: 7279020, computedTotal: 7277340,
        status: "approved", confidence: 0.8, notes: "Minor variance Rp 1,680 — rounding",
        lineItems: [
          { desc: "Oli Federal 0.8 24x3=72", qty: 72, unit: "bottle", price: 46000, total: 3312000 },
          { desc: "50C-WB01G-00 Shoe Komplit", qty: 1, unit: "set", price: 589960, total: 589960 },
          { desc: "91001-KZR-600 Laher", qty: 5, unit: "pcs", price: 81400, total: 407000 },
          { desc: "11002-KVB-930", qty: 5, unit: "pcs", price: 67672, total: 338360 },
          { desc: "12251-K56-N02 P. Gasket", qty: 20, unit: "pcs", price: 17160, total: 343200 },
        ],
      },
      {
        customerId: hondaJayaPBulan.id, merchantName: "Honda Jaya", customerName: "Honda Jaya P. Bulan",
        date: "2026-05-20", total: 4781630, computedTotal: 4781630,
        status: "approved", confidence: 0.85,
        lineItems: [
          { desc: "22011-K81-N00", qty: 100, unit: "pcs", price: 16720, total: 1672000 },
          { desc: "50550-K28-A00", qty: 1, unit: "pcs", price: 40480, total: 40480 },
          { desc: "20A-WE762-01", qty: 2, unit: "pcs", price: 131580, total: 263160 },
          { desc: "20A-VF01A-10", qty: 2, unit: "pcs", price: 291540, total: 583080 },
          { desc: "11111-KVB-903", qty: 2, unit: "pcs", price: 127600, total: 255200 },
        ],
      },
      {
        customerId: asokaJaya.id, merchantName: "Asoka Jaya", customerName: "Asoka Jaya P.Siantar",
        date: "2026-05-28", total: 15039300, computedTotal: 15039300,
        status: "approved", confidence: 0.85,
        lineItems: [
          { desc: "H103-KYB-980 Bos klep In", qty: 20, unit: "pcs", price: 15400, total: 308000 },
          { desc: "Oli MPX1 0.8", qty: 24, unit: "bottle", price: 58500, total: 1404000 },
          { desc: "Oli MPX2 0.65", qty: 24, unit: "bottle", price: 51150, total: 1227600 },
          { desc: "Oli SPX2 0.8", qty: 24, unit: "bottle", price: 72500, total: 1740000 },
          { desc: "Oli Gardan Matic 24x5=120", qty: 120, unit: "bottle", price: 42500, total: 5100000 },
          { desc: "Oli Yamalube Sport 24x1=24", qty: 24, unit: "bottle", price: 57500, total: 1380000 },
          { desc: "5BP-F6111-00 Sarang", qty: 10, unit: "pcs", price: 122550, total: 1225500 },
        ],
      },
      {
        customerId: hondaJaya.id, merchantName: "Honda Jaya", customerName: "Honda Jaya",
        date: "2026-06-09", total: 2957750, computedTotal: 2957750,
        status: "approved", confidence: 0.8,
        lineItems: [
          { desc: "Stut Keteng Satria/Smash Assy", qty: 1, unit: "set", price: 310000, total: 310000 },
          { desc: "15421-KPP-900", qty: 20, unit: "pcs", price: 1760, total: 35200 },
          { desc: "12251-E2119-00 O Ring Klep", qty: 20, unit: "pcs", price: 10750, total: 215000 },
          { desc: "13121-K81-P00 Piston Kit", qty: 2, unit: "set", price: 100320, total: 200640 },
          { desc: "2PH-E6301-01 Tali Gas", qty: 1, unit: "pcs", price: 131580, total: 131580 },
          { desc: "2PH-E7653-01 Kuku Pulley Roll", qty: 50, unit: "pcs", price: 9890, total: 494500 },
        ],
      },
      {
        customerId: hondaJayaPBulan.id, merchantName: "Honda Jaya", customerName: "Honda Jaya P. Bulan",
        date: "2026-05-29", total: 3975880, computedTotal: 3975880,
        status: "approved", confidence: 0.85,
        lineItems: [
          { desc: "52400-K59-A11 Sck blk", qty: 3, unit: "pcs", price: 220880, total: 662640 },
          { desc: "Oli Federal 0.8 24x2=48", qty: 48, unit: "bottle", price: 46000, total: 2208000 },
          { desc: "37800-K0W-N81", qty: 1, unit: "pcs", price: 54120, total: 54120 },
          { desc: "93102-24802", qty: 20, unit: "pcs", price: 12470, total: 249400 },
        ],
      },
      {
        customerId: hondaJaya.id, merchantName: "Honda Jaya", customerName: "Honda Jaya",
        date: "2024-06-03", total: 2873940, computedTotal: 2873940,
        status: "approved", confidence: 0.85,
        lineItems: [
          { desc: "2PA-E7663-01 Kuku Ruma Roler", qty: 6, unit: "pcs", price: 9890, total: 59340 },
          { desc: "2PA-WF662-01 Sepatu kld", qty: 3, unit: "set", price: 165120, total: 495360 },
          { desc: "17910-K59-A12", qty: 2, unit: "pcs", price: 90200, total: 180400 },
          { desc: "14500-KVZ-900", qty: 10, unit: "pcs", price: 44440, total: 444400 },
          { desc: "91005-KVB-N50", qty: 10, unit: "pcs", price: 35112, total: 351120 },
          { desc: "Laher HB6204", qty: 3, unit: "pcs", price: 24200, total: 72600 },
        ],
      },
      {
        customerId: hasanJaya.id, merchantName: "Amar", customerName: "Hasan Jaya P. Baru",
        date: "2026-05-26", total: 28716340, computedTotal: 28716340,
        status: "approved", confidence: 0.8,
        lineItems: [
          { desc: "Oli MPX 2 AS 24x5=120", qty: 120, unit: "bottle", price: 60000, total: 7200000 },
          { desc: "Oli MPX 1 L 24x1=24", qty: 24, unit: "bottle", price: 76300, total: 1831200 },
          { desc: "Ban dlm 90/90x14 Hmp TL", qty: 5, unit: "pcs", price: 227920, total: 1139600 },
          { desc: "2P0-E7641-00 Tali Kopling", qty: 3, unit: "pcs", price: 124700, total: 374100 },
          { desc: "16450-K15-901 Injektor", qty: 20, unit: "pcs", price: 99880, total: 1997600 },
          { desc: "16450-K25-901", qty: 20, unit: "pcs", price: 230560, total: 4611200 },
          { desc: "30510-KGS-901 Koil", qty: 20, unit: "pcs", price: 79200, total: 1584000 },
          { desc: "17211-K18-900 S. Hawa", qty: 20, unit: "pcs", price: 51912, total: 1038240 },
          { desc: "Oli Mesin 40", qty: 40, unit: "bottle", price: 45300, total: 1812000 },
          { desc: "Oli Mesin Super", qty: 40, unit: "bottle", price: 46000, total: 1840000 },
          { desc: "Oli Prima XP", qty: 12, unit: "bottle", price: 50200, total: 602400 },
        ],
      },
      {
        customerId: hondaJayaPSiantar.id, merchantName: "Honda Jaya", customerName: "Hover Jaya P.Siantar",
        date: "2026-06-06", total: 8607620, computedTotal: 8607620,
        status: "approved", confidence: 0.8,
        lineItems: [
          { desc: "48150-KZL-980 Han kop slk", qty: 10, unit: "pcs", price: 47305, total: 473050 },
          { desc: "2601-KVR-AM1 Vbelt slk", qty: 2, unit: "pcs", price: 367180, total: 734360 },
          { desc: "91208-K50-003 Oli slk", qty: 20, unit: "pcs", price: 6160, total: 123200 },
          { desc: "Busi Kharisma", qty: 2, unit: "pcs", price: 438600, total: 877200 },
          { desc: "14401-KPH-901 Rantai", qty: 5, unit: "pcs", price: 79640, total: 398200 },
          { desc: "YOA EXB00 Oli 24x3=72", qty: 72, unit: "bottle", price: 32500, total: 2340000 },
          { desc: "34906-GB6-921 Blb Stop", qty: 30, unit: "pcs", price: 12150, total: 364500 },
          { desc: "34901-KFV-651 B.dpn", qty: 70, unit: "pcs", price: 16200, total: 1134000 },
          { desc: "32102-K81-N00 Kabel Body", qty: 2, unit: "pcs", price: 311960, total: 623920 },
        ],
      },
    ];

    for (const sr of supplierReceipts) {
      const [receipt] = await db.insert(schema.receipts).values({
        receiptType: "supplier",
        customerId: (sr as any).customerId ?? null,
        merchantName: sr.merchantName,
        customerName: sr.customerName,
        receiptDate: new Date(sr.date),
        declaredTotal: sr.total,
        computedTotal: sr.computedTotal,
        currency: "IDR",
        status: sr.status as any,
        confidence: sr.confidence,
        notes: (sr as any).notes ?? null,
      }).returning();

      for (const item of sr.lineItems) {
        await db.insert(schema.lineItems).values({
          receiptId: receipt.id,
          skuId: null,
          rawDescription: item.desc,
          normalizedDescription: item.desc,
          quantity: item.qty,
          unit: item.unit,
          unitPrice: item.price,
          totalPrice: item.total,
          matchStatus: "unmatched",
          confidence: sr.confidence,
        });
      }

      if (sr.status === "flagged") {
        await db.insert(schema.flags).values({
          receiptId: receipt.id,
          flagType: "MATH_ERROR",
          message: `Computed (Rp ${sr.computedTotal.toLocaleString("id-ID")}) ≠ declared (Rp ${sr.total.toLocaleString("id-ID")}). Variance: Rp ${Math.abs(sr.total - sr.computedTotal).toLocaleString("id-ID")}. Awaiting manual review.`,
        });
      }
    }

    // ── STOCK LEDGER (only approved buyer receipts) ─────────────────────
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
        notes: `Stock in from buyer receipt #${entry.receiptId}`,
      });
    }

    return NextResponse.json({
      ok: true,
      message: "Seed complete",
      summary: {
        suppliers: 5,
        customers: 6,
        skus: 10,
        buyerReceipts: 10,
        supplierReceipts: supplierReceipts.length,
        stockEntries: stockIns.length,
      },
    });
  } catch (err: any) {
    console.error("[seed]", err);
    return NextResponse.json({ error: err?.message ?? "Seed failed" }, { status: 500 });
  }
}

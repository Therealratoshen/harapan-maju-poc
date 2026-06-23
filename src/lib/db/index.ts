/**
 * CV. Harapan Maju — Database Layer
 *
 * Vercel Postgres (postgres.js + drizzle-orm/pg)
 * Requires POSTGRES_URL environment variable.
 *
 * All tables: suppliers, customers, skus, receipts, line_items, flags, stock_ledger
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql, eq, and, like, or, desc } from "drizzle-orm";
import {
  pgTable, serial, text, integer, real, timestamp, boolean,
} from "drizzle-orm/pg-core";

// ─── Schema ────────────────────────────────────────────────────────────────

export const suppliers = pgTable("suppliers", {
  id:        serial("id").primaryKey(),
  name:      text("name").notNull(),
  type:      text("type").notNull().default("buyer"),
  address:   text("address"),
  phone:     text("phone"),
  notes:     text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customers = pgTable("customers", {
  id:        serial("id").primaryKey(),
  name:      text("name").notNull(),
  branch:    text("branch"),
  address:   text("address"),
  notes:     text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const skus = pgTable("skus", {
  id:                serial("id").primaryKey(),
  normalizedName:    text("normalized_name").notNull(),
  partNumber:       text("part_number"),
  category:         text("category"),
  unit:             text("unit").notNull().default("pcs"),
  purchasePriceAvg: real("purchase_price_avg"),
  createdAt:        timestamp("created_at").defaultNow(),
});

export const receipts = pgTable("receipts", {
  id:           serial("id").primaryKey(),
  receiptType:  text("receipt_type").notNull(),
  merchantName: text("merchant_name"),
  supplierId:   integer("supplier_id"),
  customerId:   integer("customer_id"),
  customerName: text("customer_name"),
  invoiceNumber:text("invoice_number"),
  receiptDate: timestamp("receipt_date").notNull(),
  dueDate:      timestamp("due_date"),
  subtotal:     real("subtotal").notNull().default(0),
  discount:     real("discount").notNull().default(0),
  taxAmount:    real("tax_amount").notNull().default(0),
  declaredTotal:real("declared_total").notNull(),
  computedTotal:real("computed_total").notNull().default(0),
  currency:     text("currency").notNull().default("IDR"),
  status:       text("status").notNull().default("pending"),
  confidence:   real("confidence").notNull().default(0),
  imageUrl:     text("image_url"),
  sourceFile:   text("source_file"),
  notes:        text("notes"),
  createdAt:    timestamp("created_at").defaultNow(),
});

export const lineItems = pgTable("line_items", {
  id:                   serial("id").primaryKey(),
  receiptId:            integer("receipt_id").notNull(),
  skuId:                integer("sku_id"),
  rawDescription:       text("raw_description").notNull(),
  normalizedDescription:text("normalized_description"),
  partNumber:           text("part_number"),
  quantity:             real("quantity").notNull(),
  unit:                 text("unit").notNull().default("pcs"),
  unitPrice:            real("unit_price").notNull(),
  totalPrice:           real("total_price").notNull(),
  matchStatus:          text("match_status").notNull().default("unmatched"),
  confidence:           real("confidence").notNull().default(0),
});

export const flags = pgTable("flags", {
  id:         serial("id").primaryKey(),
  receiptId:  integer("receipt_id").notNull(),
  lineItemId: integer("line_item_id"),
  flagType:   text("flag_type").notNull(),
  message:    text("message").notNull(),
  resolved:   boolean("resolved").notNull().default(false),
  resolvedBy: text("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt:  timestamp("created_at").defaultNow(),
});

export const stockLedger = pgTable("stock_ledger", {
  id:             serial("id").primaryKey(),
  skuId:          integer("sku_id").notNull(),
  receiptId:      integer("receipt_id"),
  lineItemId:     integer("line_item_id"),
  movementType:   text("movement_type").notNull(),
  quantity:       real("quantity").notNull(),
  unitPrice:      real("unit_price").notNull(),
  runningBalance: real("running_balance").notNull(),
  notes:          text("notes"),
  createdAt:      timestamp("created_at").defaultNow(),
});

export const activityLogs = pgTable("activity_logs", {
  id:         serial("id").primaryKey(),
  receiptId:  integer("receipt_id"),
  action:     text("action").notNull(), // photo_uploaded | ocr_completed | approved | rejected | flag_raised | stock_updated
  message:    text("message"),
  actor:      text("actor"),            // telegram | dashboard | system
  createdAt:  timestamp("created_at").defaultNow(),
});

// ─── DB Client ─────────────────────────────────────────────────────────────

let _db: ReturnType<typeof drizzle> | null = null;
let _pg: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!_db) {
    const connStr = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
    if (!connStr) throw new Error("POSTGRES_URL environment variable is required");
    _pg = postgres(connStr, {
      max: 1,
      ssl: { rejectUnauthorized: false },
      transform: { undefined: null },
    });
    _db = drizzle(_pg);
  }
  return _db;
}

// Transparent lazy proxy — routes can use `db.select()` etc. without await
// The drizzle instance is created on first property access, after env vars are loaded
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    const instance = getDb();
    const value = (instance as any)[prop];
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});

// ─── Backward-compat schema export ──────────────────────────────────────────
// All routes import { db, schema } from "@/lib/db"
export const schema = {
  receipts,
  lineItems,
  flags,
  stockLedger,
  skus,
  suppliers,
  customers,
  activityLogs,
};

// ─── Types ─────────────────────────────────────────────────────────────────
export type Supplier         = typeof suppliers.$inferSelect;
export type Customer        = typeof customers.$inferSelect;
export type Sku             = typeof skus.$inferSelect;
export type Receipt         = typeof receipts.$inferSelect;
export type LineItem        = typeof lineItems.$inferSelect;
export type Flag            = typeof flags.$inferSelect;
export type StockLedgerEntry= typeof stockLedger.$inferSelect;
export type ReceiptStatus   = "pending" | "reviewed" | "approved" | "flagged" | "rejected";
export type ReceiptType     = "buyer" | "supplier";

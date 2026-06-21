import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  type: text("type", { enum: ["buyer", "supplier", "both"] }).notNull().default("buyer"),
  address: text("address"),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Customers ────────────────────────────────────────────────────────────────
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  branch: text("branch"), // e.g., "P. Bulan", "P. Siantar"
  address: text("address"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── SKUs ─────────────────────────────────────────────────────────────────────
export const skus = sqliteTable("skus", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  normalizedName: text("normalized_name").notNull(), // e.g., "Oli Federal 0.8L"
  partNumber: text("part_number"), // e.g., "44711K0WNO1"
  category: text("category"), // e.g., "oil", "tire", "brake"
  unit: text("unit").notNull().default("pcs"), // "pcs", "liter", "carton"
  purchasePriceAvg: real("purchase_price_avg"), // running average cost
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Receipts ─────────────────────────────────────────────────────────────────
export const receipts = sqliteTable("receipts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receiptType: text("receipt_type", { enum: ["buyer", "supplier"] }).notNull(),
  merchantName: text("merchant_name"), // the shop issuing / stamped on the receipt
  supplierId: integer("supplier_id").references(() => suppliers.id),
  customerId: integer("customer_id").references(() => customers.id),
  customerName: text("customer_name"), // raw customer name on receipt
  invoiceNumber: text("invoice_number"),
  receiptDate: integer("receipt_date", { mode: "timestamp" }).notNull(),
  dueDate: integer("due_date", { mode: "timestamp" }),
  subtotal: real("subtotal").notNull().default(0),
  discount: real("discount").notNull().default(0),
  taxAmount: real("tax_amount").notNull().default(0),
  declaredTotal: real("declared_total").notNull(), // what the receipt says
  computedTotal: real("computed_total").notNull().default(0), // sum of line items
  currency: text("currency").notNull().default("IDR"),
  status: text("status", {
    enum: ["pending", "reviewed", "approved", "flagged", "rejected"],
  }).notNull().default("pending"),
  confidence: real("confidence").notNull().default(0), // 0–1
  imageUrl: text("image_url"),
  sourceFile: text("source_file"),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Line Items ────────────────────────────────────────────────────────────────
export const lineItems = sqliteTable("line_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receiptId: integer("receipt_id")
    .notNull()
    .references(() => receipts.id, { onDelete: "cascade" }),
  skuId: integer("sku_id").references(() => skus.id),
  rawDescription: text("raw_description").notNull(), // what was written on receipt
  normalizedDescription: text("normalized_description"),
  partNumber: text("part_number"),
  quantity: real("quantity").notNull(),
  unit: text("unit").notNull().default("pcs"),
  unitPrice: real("unit_price").notNull(),
  totalPrice: real("total_price").notNull(),
  matchStatus: text("match_status", {
    enum: ["unmatched", "matched", "partial", "uncertain"],
  }).notNull().default("unmatched"),
  confidence: real("confidence").notNull().default(0),
});

// ─── Flags ─────────────────────────────────────────────────────────────────────
export const flags = sqliteTable("flags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  receiptId: integer("receipt_id")
    .notNull()
    .references(() => receipts.id, { onDelete: "cascade" }),
  lineItemId: integer("line_item_id").references(() => lineItems.id),
  flagType: text("flag_type", {
    enum: [
      "MATH_ERROR",
      "MISSING_DATE",
      "NEGATIVE_STOCK",
      "UNRECONCILED",
      "DUPLICATE",
      "FOREIGN_CURRENCY",
      "DEAD_STOCK",
      "LOW_CONFIDENCE",
      "MISSING_INVOICE_NO",
    ],
  }).notNull(),
  message: text("message").notNull(),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  resolvedBy: text("resolved_by"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Stock Ledger ──────────────────────────────────────────────────────────────
export const stockLedger = sqliteTable("stock_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  skuId: integer("sku_id")
    .notNull()
    .references(() => skus.id),
  receiptId: integer("receipt_id").references(() => receipts.id),
  lineItemId: integer("line_item_id").references(() => lineItems.id),
  movementType: text("movement_type", { enum: ["in", "out", "adjustment"] }).notNull(),
  quantity: real("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  runningBalance: real("running_balance").notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ─── Types ─────────────────────────────────────────────────────────────────────
export type Supplier = typeof suppliers.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Sku = typeof skus.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type LineItem = typeof lineItems.$inferSelect;
export type Flag = typeof flags.$inferSelect;
export type StockLedgerEntry = typeof stockLedger.$inferSelect;

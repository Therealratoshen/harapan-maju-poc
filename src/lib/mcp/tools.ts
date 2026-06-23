export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

export const MCP_TOOLS: ToolDefinition[] = [
  {
    name: "get_summary",
    description: "Get dashboard summary — total revenue, COGS, gross margin, receipt counts, flag summary",
    parameters: [],
  },
  {
    name: "list_receipts",
    description: "List receipts with optional filters",
    parameters: [
      { name: "status", type: "string", description: "Filter by status: approved, pending, rejected", required: false, enum: ["approved", "pending", "rejected"] },
      { name: "receiptType", type: "string", description: "Filter by type: buyer (pembelian) or supplier (penjualan)", required: false, enum: ["buyer", "supplier"] },
      { name: "limit", type: "number", description: "Max results (default 20)", required: false },
      { name: "offset", type: "number", description: "Pagination offset", required: false },
    ],
  },
  {
    name: "get_receipt",
    description: "Get a single receipt with line items and flags",
    parameters: [
      { name: "receiptId", type: "number", description: "Receipt ID (numeric)", required: true },
    ],
  },
  {
    name: "get_flags",
    description: "Get unresolved flags with receipt context",
    parameters: [
      { name: "unresolvedOnly", type: "boolean", description: "Only unresolved flags (default true)", required: false },
      { name: "flagType", type: "string", description: "Filter by flag type", required: false },
    ],
  },
  {
    name: "get_stock",
    description: "Get current stock balance per SKU with inbound/outbound totals",
    parameters: [
      { name: "category", type: "string", description: "Filter by category", required: false },
      { name: "lowStockOnly", type: "boolean", description: "Only items with balance <= 0", required: false },
    ],
  },
  {
    name: "get_receipt_logs",
    description: "Get activity logs for a receipt",
    parameters: [
      { name: "receiptId", type: "number", description: "Receipt ID (numeric)", required: true },
    ],
  },
  {
    name: "get_revenue_trends",
    description: "Get monthly revenue and COGS trends for a given year",
    parameters: [
      { name: "year", type: "number", description: "Year (default current year)", required: false },
    ],
  },
  {
    name: "get_top_merchants",
    description: "Get top merchants by total declared value",
    parameters: [
      { name: "limit", type: "number", description: "Number of top merchants (default 10)", required: false },
    ],
  },
  {
    name: "create_receipt",
    description: "Create a new receipt (from photo upload or manual entry)",
    parameters: [
      { name: "receiptType", type: "string", description: "buyer (pembelian) or supplier (penjualan)", required: true, enum: ["buyer", "supplier"] },
      { name: "imageUrl", type: "string", description: "URL of receipt image (Vercel Blob URL)", required: false },
      { name: "merchantName", type: "string", description: "Merchant or customer name", required: false },
    ],
  },
  {
    name: "add_line_items",
    description: "Add line items to an existing receipt",
    parameters: [
      { name: "receiptId", type: "number", description: "Receipt ID", required: true },
      { name: "items", type: "array", description: "Array of { description, quantity, unit, unitPrice, totalPrice?, partNumber? }", required: true },
    ],
  },
  {
    name: "approve_receipt",
    description: "Approve a pending receipt — updates stock ledger if buyer receipt",
    parameters: [
      { name: "receiptId", type: "number", description: "Receipt ID to approve", required: true },
    ],
  },
  {
    name: "reject_receipt",
    description: "Reject a pending receipt",
    parameters: [
      { name: "receiptId", type: "number", description: "Receipt ID to reject", required: true },
      { name: "notes", type: "string", description: "Reason for rejection", required: false },
    ],
  },
  {
    name: "flag_receipt",
    description: "Manually raise a flag on a receipt",
    parameters: [
      { name: "receiptId", type: "number", description: "Receipt ID", required: true },
      { name: "flagType", type: "string", description: "Type of flag", required: true, enum: ["MATH_ERROR", "MISSING_DATE", "MISSING_INVOICE_NO", "NEGATIVE_STOCK", "UNRECONCILED", "DUPLICATE", "FOREIGN_CURRENCY", "DEAD_STOCK", "LOW_CONFIDENCE"] },
      { name: "message", type: "string", description: "Description of the issue", required: true },
    ],
  },
  {
    name: "erase_receipt",
    description: "Permanently delete a receipt and all its associated data (line items, flags, stock ledger entries, activity logs)",
    parameters: [
      { name: "receiptId", type: "number", description: "Receipt ID to erase", required: true },
    ],
  },
];

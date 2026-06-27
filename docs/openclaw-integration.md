# OpenCLAW Integration Spec — CV. Harapan Maju

```
BASE URL: https://harapan-maju-poc.vercel.app
AUTH:    (Vercel Team SSO must be disabled in dashboard settings)

⚠️  IMPORTANT: The project has Vercel Team SSO protection enabled.
To allow OpenCLAW to call these APIs, either:
  A) Disable SSO: Vercel Dashboard → Project → Settings → Authentication → Off
  B) Add a custom domain (SSO only applies to *.vercel.app URLs)
```

---

## API Reference

### 1. Dashboard Summary (Main Finance API)

**Endpoint:** `GET /api/dashboard/summary`

**Auth:** None (after disabling Vercel SSO)

**Response:**
```json
{
  "greeting": "Good morning",
  "summary": {
    "revenue": 76856880,
    "cogs": 118616200,
    "grossProfit": -41759320,
    "grossMargin": -54.3,
    "buyerReceipts": 10,
    "supplierReceipts": 7,
    "pendingFlags": 0,
    "totalReceipts": 17,
    "pendingReceipts": 0,
    "lineItemCount": 79
  },
  "monthly": [
    { "month": "May 2026", "revenue": 66798310, "cogs": 0, "profit": 66798310 },
    { "month": "Jun 2026", "revenue": 10058570, "cogs": 118616200, "profit": -108557630 }
  ],
  "cogsBySupplier": [
    { "supplier": "PT Capella Patria", "total": 48000000 },
    ...
  ],
  "recentReceipts": [
    {
      "id": 41,
      "merchant_name": "Central Motor (CM)",
      "receipt_type": "supplier",
      "status": "approved",
      "declared_total": 25920000,
      "receipt_date": "2026-06-12"
    }
  ],
  "flagSummary": [],
  "topMerchants": [...],
  "reconciliationAlerts": []
}
```

---

### 2. List All Receipts

**Endpoint:** `GET /api/receipts`

**Auth:** None (after disabling Vercel SSO)

**Query params:**
- `limit` — max results (default 100)
- `offset` — pagination offset (default 0)
- `status` — `approved`, `pending`, `flagged`, `rejected`
- `receiptType` — `buyer`, `supplier`
- `search` — search merchant name, customer name, invoice number

**Response:**
```json
{
  "receipts": [
    {
      "id": 41,
      "receiptType": "supplier",
      "merchantName": "Central Motor (CM)",
      "customerName": null,
      "invoiceNumber": "INV-2024-0041",
      "receiptDate": "2026-06-12T00:00:00.000Z",
      "declaredTotal": 25920000,
      "computedTotal": 25920000,
      "currency": "IDR",
      "status": "approved",
      "confidence": 0.95,
      "imageUrl": "https://...",
      "lineItems": [
        {
          "id": 123,
          "description": "Honda Oli MPX2 10W30 0.8L",
          "partNumber": "HPM-001",
          "quantity": 120,
          "unit": "pcs",
          "unitPrice": 216000,
          "totalPrice": 25920000
        }
      ],
      "flags": []
    }
  ],
  "count": 17,
  "total": 17
}
```

---

### 3. Single Receipt

**Endpoint:** `GET /api/receipts/{id}`

**Auth:** None

**Response:** Same structure as a single receipt from `/api/receipts`

---

### 4. Stock Inventory

**Endpoint:** `GET /api/dashboard/stock`

**Auth:** None

**Response:**
```json
{
  "stock": [
    {
      "skuId": 1,
      "normalizedName": "Honda Oli MPX2 10W30 0.8L",
      "category": "oli",
      "unit": "pcs",
      "stockIn": 1000,
      "stockOut": 352,
      "balance": 648,
      "avgPurchasePrice": 195000
    }
  ]
}
```

---

### 5. Stock Movements

**Endpoint:** `GET /api/stock/movements`

**Auth:** None

**Response:**
```json
{
  "movements": [
    {
      "id": 1,
      "skuName": "Honda Oli MPX2 10W30 0.8L",
      "movementType": "in",
      "quantity": 1000,
      "receiptId": 41,
      "createdAt": "2026-06-12T00:00:00.000Z"
    }
  ],
  "count": 14,
  "totalIn": 1095,
  "totalOut": 7
}
```

---

### 6. Flags

**Endpoint:** `GET /api/dashboard/flags`

**Auth:** None

**Response:**
```json
{
  "flags": [
    {
      "id": 1,
      "receiptId": 43,
      "flagType": "LOW_CONFIDENCE",
      "message": "OCR confidence 30% — manual verification needed.",
      "resolved": false,
      "createdAt": "2026-06-12T00:00:00.000Z"
    }
  ],
  "flagCounts": [
    { "flagType": "MATH_ERROR", "count": 2, "receiptCount": 1 }
  ]
}
```

---

### 7. MCP JSON-RPC (Structured AI Tools)

**Endpoint:** `POST /api/mcp`

**Auth:** None (after disabling Vercel SSO)

**Content-Type:** `application/json`

**Methods:**

`get_summary` — Financial summary
```json
{"jsonrpc":"2.0","id":1,"method":"get_summary","params":{}}
```

`list_receipts` — Paginated receipts
```json
{"jsonrpc":"2.0","id":1,"method":"list_receipts","params":{"limit":20,"offset":0}}
```

`get_receipt` — Single receipt with line items
```json
{"jsonrpc":"2.0","id":1,"method":"get_receipt","params":{"receiptId":41}}
```

`get_flags` — Flags
```json
{"jsonrpc":"2.0","id":1,"method":"get_flags","params":{"unresolvedOnly":true}}
```

`get_stock` — Inventory
```json
{"jsonrpc":"2.0","id":1,"method":"get_stock","params":{}}
```

`get_revenue_trends` — Monthly trends
```json
{"jsonrpc":"2.0","id":1,"method":"get_revenue_trends","params":{"year":2026}}
```

---

## Database Schema

| Table | Description |
|---|---|
| `receipts` | All receipts (buyer=expense, supplier=revenue) |
| `line_items` | Individual line items per receipt |
| `flags` | Quality flags (MATH_ERROR, MISSING_INVOICE_NO, etc.) |
| `stock_ledger` | Stock movements (in/out per SKU) |
| `skus` | Product catalog |

**Key fields:**
- `receipts.receipt_type` — `buyer` (expense/purchase) or `supplier` (revenue/sale)
- `receipts.status` — `pending`, `approved`, `flagged`, `rejected`
- `receipts.currency` — always `IDR`
- `line_items.total_price` — the source of truth for financial totals (not `receipts.declared_total`)

---

## Business Context

CV. Harapan Maju is a spare parts and workshop business in Indonesia.

- **Buyer receipts** = purchases (COGS / expenses)
- **Supplier receipts** = sales (revenue)
- All amounts in **IDR** (Indonesian Rupiah)
- Inventory tracks spare parts by SKU
- The system flags suspicious receipts for manual review

## Telegram Bot

**Bot:** `@DuringgAWSS_bot`
**Webhook:** Already connected — bot receives messages and processes via MiniMax AI

The Telegram bot already has the AI layer and business context. OpenCLAW can either:
1. **Call the dashboard APIs directly** (after disabling SSO)
2. **Send Telegram messages** to the bot to trigger AI responses

Both approaches work — option 1 gives structured JSON, option 2 gives conversational AI responses.

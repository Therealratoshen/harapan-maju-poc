# CV. Harapan Maju — Receipt & Revenue Tracker

> POC Build — powered by **Hermes AI**

A web-based system to ingest, reconcile, and visualize motorbike parts purchase and sales data. Built with Next.js + SQLite (Drizzle ORM).

## Quick Start

```bash
# Install dependencies
npm install

# Push database schema
npx drizzle-kit push

# Seed with sample data (20 receipts)
npx tsx scripts/seed.ts

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Dashboard Pages

| Page | URL | What it shows |
|---|---|---|
| Summary | `/dashboard/summary` | Revenue, COGS, gross margin, monthly chart |
| Receipts | `/dashboard/receipts` | All receipts, expandable, filterable |
| Stock | `/dashboard/stock` | SKU balance per category |
| Flags | `/dashboard/flags` | Discrepancies, math errors, unresolved items |
| Upload | `/dashboard/upload` | Upload receipts for OCR processing |

## API

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/receipts` | List receipts (filter by type, status, date) |
| POST | `/api/receipts` | Create receipt + auto-flagging |
| GET | `/api/dashboard/summary` | Revenue, COGS, margin summary |
| GET | `/api/dashboard/stock` | Stock position per SKU |
| GET | `/api/dashboard/flags` | All flags with counts |
| PATCH | `/api/dashboard/flags` | Resolve a flag |
| GET/POST | `/api/telegram` | Hermes Telegram bot webhook |

## Hermes AI — Telegram Integration

### Setup

1. Open Telegram → chat with **@BotFather**
2. Send `/newbot` → follow prompts → copy the **BOT_TOKEN**
3. Add to `.env.local`:
   ```
   TELEGRAM_BOT_TOKEN=123456789:ABCdefGHI...
   ```
4. Set the webhook (replace with your domain):
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-domain.com/api/telegram"
   ```
5. Restart the dev server

### What Hermes Responds To

| Message | Response |
|---|---|
| `revenue` / `omset` | Revenue summary |
| `cogs` / `cost` / `pembelian` | Purchase summary |
| `margin` / `profit` / `laba` | Margin report |
| `stock` / `stok` | Current stock position |
| `receipts` / `struk` | Recent 5 receipts |
| `flags` / `masalah` | Unresolved flags count |
| Photo | Logs receipt photo (for review) |
| `help` / `start` | Command reference |

### Example Flow

```
You: "revenue"
Hermes: 📊 Revenue Summary
        Total revenue (approved, IDR): Rp 73,403,440

You: "margin"
Hermes: 📈 Margin Report
        Revenue: Rp 73,403,440
        COGS: Rp 68,927,725
        Gross Profit: Rp 4,475,715
        Margin: 6.1%
```

## Tech Stack

| Layer | Technology |
|---|---|
| App | Next.js 16 (App Router) |
| Database | SQLite + Drizzle ORM |
| Charts | Recharts |
| Styling | Tailwind CSS |
| OCR | MiniMax M2.5 (production) |
| IM | Telegram Bot API |
| Hosting | Any Node.js host (Vercel, Railway, VPS) |

## Data Model

```
receipts ──────── line_items
     │                  │
     └── flags ─────────┘
     │
suppliers ─── customers
     │
  skus ─── stock_ledger
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── receipts/          # Receipt CRUD
│   │   ├── dashboard/
│   │   │   ├── summary/       # Revenue/COGS/margin
│   │   │   ├── stock/         # Stock position
│   │   │   └── flags/         # Flag management
│   │   └── telegram/          # Hermes Telegram bot
│   ├── dashboard/
│   │   ├── summary/           # Summary page
│   │   ├── receipts/          # Receipt feed
│   │   ├── stock/             # Stock page
│   │   ├── flags/             # Flags page
│   │   └── upload/            # Upload page
│   └── page.tsx               # Landing page
├── lib/
│   └── db/
│       ├── schema.ts          # Drizzle schema
│       └── index.ts           # DB connection
scripts/
└── seed.ts                   # Seed 20 sample receipts
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

## Going to Production

1. **Swap SQLite → PostgreSQL** — update `src/lib/db/index.ts`
2. **Add `OPENAI_API_KEY`** — for Hermes AI responses via MiniMax
3. **Add `TELEGRAM_BOT_TOKEN`** — for Telegram integration
4. **Set `TELEGRAM_WEBHOOK_URL`** — your production domain
5. **Deploy** — Vercel, Railway, or any VPS with Node.js

---

*Built with agents — managed by Workflow (Bengkel)*

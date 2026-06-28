/**
 * GET /api/health — public status (no auth)
 */

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getApiKeyConfig } from "@/lib/auth";

export async function GET() {
  const auth = await getApiKeyConfig();

  let databaseOk = false;
  let receiptCount = 0;
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.receipts);
    receiptCount = Number(row?.count ?? 0);
    databaseOk = true;
  } catch {
    databaseOk = false;
  }

  const env = {
    database: Boolean(process.env.POSTGRES_URL ?? process.env.DATABASE_URL),
    blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    minimax: Boolean(process.env.MINIMAX_API_KEY),
    ownerChat: Boolean(process.env.OWNER_CHAT_ID),
  };

  const missing = Object.entries(env)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);

  return NextResponse.json({
    ok: databaseOk,
    degraded: missing.length > 0,
    version: "1.1",
    env,
    database: { ok: databaseOk, receiptCount },
    auth: {
      enabled: auth.configured,
      authFromEnv: auth.authFromEnv,
      authFromDb: auth.authFromDb,
      keyLength: auth.length,
    },
    telegram: {
      endpoint: "/api/telegram",
      requiresApiKey: false,
      webhookUrl: process.env.NEXT_PUBLIC_BASE_URL
        ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/telegram`
        : null,
    },
    mcp: {
      endpoint: "/api/mcp",
      getPublic: true,
      postRequiresApiKey: auth.configured,
    },
    missing,
    hints:
      missing.length > 0
        ? [`Set env vars: ${missing.join(", ")}`]
        : auth.configured
          ? []
          : ["Set INTERNAL_API_KEY in Vercel — it will sync to app_config automatically"],
  });
}

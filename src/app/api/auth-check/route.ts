/**
 * GET /api/auth-check — public diagnostic (no secrets exposed)
 *
 * Helps debug OpenCLAW / MCP auth without leaking the key value.
 * Telegram bot does NOT use this — it has no API key requirement.
 */

import { NextResponse } from "next/server";
import { getApiKeyConfig } from "@/lib/auth";

export async function GET() {
  const config = getApiKeyConfig();

  return NextResponse.json({
    ok: true,
    apiKey: {
      configured: config.configured,
      sourceEnvVar: config.source,
      length: config.length,
      expectedEnvVar: "INTERNAL_API_KEY",
      alsoAccepted: ["x_api_key", "X_API_KEY"],
    },
    requestHeaders: {
      accepted: ["x-api-key", "x_api_key", "Authorization: Bearer <key>", "?api_key=<key>"],
      note: "HTTP headers use hyphens/underscores — this is NOT the Vercel env var name.",
    },
    telegram: {
      endpoint: "/api/telegram",
      requiresApiKey: false,
      note: "If /api/telegram returns 401 with only {\"error\":\"Unauthorized\"}, that is Vercel SSO — disable it in project Settings → Authentication.",
    },
    mcp: {
      endpoint: "/api/mcp",
      getPublic: true,
      postRequiresApiKey: config.configured,
    },
  });
}

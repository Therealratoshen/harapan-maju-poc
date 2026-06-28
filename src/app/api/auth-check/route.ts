/**
 * GET /api/auth-check — public diagnostic (no secrets exposed)
 */

import { NextResponse } from "next/server";
import { getApiKeyConfig } from "@/lib/auth";

export async function GET() {
  const config = await getApiKeyConfig();

  return NextResponse.json({
    ok: true,
    apiKey: {
      configured: config.configured,
      authFromEnv: config.authFromEnv,
      authFromDb: config.authFromDb,
      sourceEnvVar: config.envSource,
      length: config.length,
      expectedEnvVar: "INTERNAL_API_KEY",
      dbConfigKey: config.configKey,
    },
    requestHeaders: {
      accepted: ["x-api-key", "x_api_key", "Authorization: Bearer <key>", "?api_key=<key>"],
    },
    dashboard: {
      sameOriginBypass: true,
      note: "Browser requests from /dashboard do not need the API key header.",
    },
    telegram: {
      endpoint: "/api/telegram",
      requiresApiKey: false,
    },
    mcp: {
      endpoint: "/api/mcp",
      getPublic: true,
      postRequiresApiKey: config.configured,
    },
  });
}

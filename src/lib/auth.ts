import { NextRequest, NextResponse } from "next/server";

/** Env var names we accept — users sometimes create `x_api_key` by mistake. */
const API_KEY_ENV_NAMES = ["INTERNAL_API_KEY", "x_api_key", "X_API_KEY"] as const;

function getConfiguredApiKey(): string {
  for (const name of API_KEY_ENV_NAMES) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

const API_KEY = getConfiguredApiKey();

export function getApiKeyConfig() {
  const source = API_KEY_ENV_NAMES.find((name) => process.env[name]?.trim()) ?? null;
  return {
    configured: API_KEY.length > 0,
    source,
    length: API_KEY.length,
    envNamesChecked: [...API_KEY_ENV_NAMES],
  };
}

export function requireApiKey(request: NextRequest): NextResponse | null {
  if (!API_KEY) return null; // No key configured — allow all

  const key = (
    request.headers.get("x-api-key") ??
    request.headers.get("x_api_key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("api_key") ??
    ""
  ).trim();

  if (!key || key !== API_KEY) {
    return NextResponse.json(
      {
        error:
          "Unauthorized. Sign in to the dashboard, or provide a valid API key via x-api-key, x_api_key, or Authorization: Bearer.",
        hint: "Vercel env var must be INTERNAL_API_KEY (not the header name). Check GET /api/auth-check.",
      },
      { status: 401 }
    );
  }

  return null; // OK
}

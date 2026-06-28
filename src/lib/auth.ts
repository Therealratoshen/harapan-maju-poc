import { NextRequest, NextResponse } from "next/server";
import { getAppConfig, setAppConfig } from "@/lib/app-config";

/** Vercel env var names (NOT HTTP header names). */
const API_KEY_ENV_NAMES = [
  "INTERNAL_API_KEY",
  "API_SECRET_KEY",
  "x_api_key",
  "X_API_KEY",
] as const;

const CONFIG_KEY = "API_SECRET_KEY";

let resolvedKey: string | null = null;
let resolvePromise: Promise<string> | null = null;

function readEnvApiKey(): string {
  for (const name of API_KEY_ENV_NAMES) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

/** Resolve API key: env first, then app_config DB. Auto-seeds DB from env when empty. */
export async function resolveApiKey(): Promise<string> {
  if (resolvedKey !== null) return resolvedKey;
  if (!resolvePromise) {
    resolvePromise = (async () => {
      const fromEnv = readEnvApiKey();
      if (fromEnv) {
        try {
          const fromDb = await getAppConfig(CONFIG_KEY);
          if (!fromDb) await setAppConfig(CONFIG_KEY, fromEnv);
        } catch {
          // DB unavailable — env still works
        }
        return fromEnv;
      }

      try {
        const fromDb = await getAppConfig(CONFIG_KEY);
        if (fromDb) return fromDb;
      } catch {
        // no DB
      }

      return "";
    })();
  }

  resolvedKey = await resolvePromise;
  return resolvedKey;
}

export function resetApiKeyCache() {
  resolvedKey = null;
  resolvePromise = null;
}

export async function getApiKeyConfig() {
  const key = await resolveApiKey();
  const envSource =
    API_KEY_ENV_NAMES.find((name) => process.env[name]?.trim()) ?? null;

  let dbConfigured = false;
  try {
    dbConfigured = Boolean(await getAppConfig(CONFIG_KEY));
  } catch {
    // ignore
  }

  return {
    configured: key.length > 0,
    length: key.length,
    authFromEnv: Boolean(envSource),
    authFromDb: dbConfigured,
    envSource,
    configKey: CONFIG_KEY,
    envNamesChecked: [...API_KEY_ENV_NAMES],
  };
}

/** Browser dashboard requests from the same deployment — no API key header needed. */
export function isSameOriginRequest(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin" || secFetchSite === "same-site") return true;

  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "";

  const origin = request.headers.get("origin");
  if (origin && host) {
    try {
      if (new URL(origin).host === host.split(",")[0].trim()) return true;
    } catch {
      // ignore bad origin
    }
  }

  const referer = request.headers.get("referer");
  if (referer && host) {
    try {
      if (new URL(referer).host === host.split(",")[0].trim()) return true;
    } catch {
      // ignore
    }
  }

  return false;
}

export function extractRequestApiKey(request: NextRequest): string {
  return (
    request.headers.get("x-api-key") ??
    request.headers.get("x_api_key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("api_key") ??
    ""
  ).trim();
}

/**
 * Protect external API access. When a key is configured:
 * - Same-origin dashboard/browser requests are allowed
 * - External callers (OpenCLAW) must send x-api-key / Bearer
 * When no key is configured, all requests are allowed (dev mode).
 */
export async function requireApiKey(
  request: NextRequest
): Promise<NextResponse | null> {
  const configuredKey = await resolveApiKey();
  if (!configuredKey) return null;

  if (isSameOriginRequest(request)) return null;

  const provided = extractRequestApiKey(request);
  if (provided && provided === configuredKey) return null;

  return NextResponse.json(
    {
      error:
        "Unauthorized. Provide a valid API key via x-api-key, x_api_key, or Authorization: Bearer.",
      hint: "Dashboard same-origin requests are allowed. External agents need the API key. Check GET /api/health.",
    },
    { status: 401 }
  );
}

/** Block destructive admin routes in production unless authenticated. */
export async function requireAdminApiKey(
  request: NextRequest
): Promise<NextResponse | null> {
  if (process.env.NODE_ENV !== "production") return requireApiKey(request);
  return requireApiKey(request);
}

import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.INTERNAL_API_KEY ?? "";

export function requireApiKey(request: NextRequest): NextResponse | null {
  if (!API_KEY) return null; // No key configured — allow all

  const key =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("api_key") ??
    "";

  if (!key || key !== API_KEY) {
    return NextResponse.json(
      { error: "Unauthorized. Provide a valid API key via x-api-key header or ?api_key= query param." },
      { status: 401 }
    );
  }

  return null; // OK
}
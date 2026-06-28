/**
 * Runtime config stored in Postgres (app_config table).
 * Production uses authFromDb — API_SECRET_KEY lives here.
 */

import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const CACHE_MS = 60_000;
const cache = new Map<string, { value: string; at: number }>();

export async function getAppConfig(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value || null;

  try {
    const rows = await db
      .select({ value: schema.appConfig.value })
      .from(schema.appConfig)
      .where(eq(schema.appConfig.key, key))
      .limit(1);

    const value = rows[0]?.value?.trim() ?? "";
    cache.set(key, { value, at: Date.now() });
    return value || null;
  } catch {
    return null;
  }
}

export async function setAppConfig(key: string, value: string): Promise<void> {
  const trimmed = value.trim();
  await db
    .insert(schema.appConfig)
    .values({ key, value: trimmed, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.appConfig.key,
      set: { value: trimmed, updatedAt: new Date() },
    });
  cache.set(key, { value: trimmed, at: Date.now() });
}

export function clearAppConfigCache() {
  cache.clear();
}

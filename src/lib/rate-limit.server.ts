// Per-visitor limits for public pages that write to the database.
//
// Kenyan mobile data runs through carrier-grade NAT: thousands of phones can
// share one public address. Limits keyed on an address have to be generous,
// and are there to stop a script, not to ration a crowd.

import { createHash } from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * The visitor's connection as Cloudflare saw it, hashed so the address itself
 * is never stored. Null when there is no such header to trust, and then no
 * limit applies: a missing header must not put every visitor in one bucket.
 */
export function visitorKey(request: Request): string | null {
  const ip = request.headers.get("cf-connecting-ip")?.trim();
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/** Count one hit. A limiter that fails lets the request through. */
export async function withinLimit(
  sb: SupabaseClient<Database>,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await sb.rpc("rate_limit_hit", {
    _key: key,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`Rate limit check failed: ${error.message}`);
    return true;
  }
  return data !== false;
}

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimitBucketKey, rateLimitWindowSeconds } from "@/lib/rate-limit-key";

/**
 * Atomic fixed-window limit stored in PostgreSQL, shared across serverless instances.
 * Requires migration 0014. Fail CLOSED when the RPC or database is unavailable.
 * Raw IP addresses, tokens and customer emails are never stored in the bucket table.
 */
export async function rateLimit(rawKey: string, max: number, windowMs: number): Promise<boolean> {
  try {
    if (!Number.isSafeInteger(max) || max < 1 || max > 1000) return false;
    const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const bucket = rateLimitBucketKey(rawKey, secret ?? "");
    const windowSeconds = rateLimitWindowSeconds(windowMs);
    const sb = createAdminClient();
    const { data, error } = await sb.rpc("consume_rate_limit", {
      p_bucket_key: bucket,
      p_limit: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error(`[rate-limit] database unavailable (${error.code ?? "unknown"})`);
      return false;
    }
    return data === true;
  } catch (error) {
    console.error("[rate-limit] invalid configuration or database connection");
    return false;
  }
}

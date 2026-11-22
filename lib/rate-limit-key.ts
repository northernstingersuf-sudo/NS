import { createHmac } from "node:crypto";

/** Stable, privacy-preserving bucket IDs across all Vercel instances. */
export function rateLimitBucketKey(rawKey: string, secret: string): string {
  if (typeof rawKey !== "string" || rawKey.length < 1 || rawKey.length > 512 ||
      typeof secret !== "string" || secret.length < 16)
    throw new Error("Invalid rate-limit configuration");
  return createHmac("sha256", secret).update(rawKey, "utf8").digest("hex");
}

/** Database accepts 1–86400 seconds; ceiling prevents a shorter window. */
export function rateLimitWindowSeconds(windowMs: number): number {
  if (!Number.isSafeInteger(windowMs) || windowMs < 1 || windowMs > 86_400_000)
    throw new Error("Invalid rate-limit window");
  return Math.ceil(windowMs / 1000);
}

/**
 * Enkel begränsning per serverinstans (in-memory). Skydd mot enkla skript och dubbelklick, INTE ett fullgott skydd:
 * på serverless/flera instanser delas inte räknaren. Komplettera med Vercel/Cloudflare-regler före lansering.
 */
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const k of hits.keys()) { if (!(hits.get(k) ?? []).some((t) => now - t < windowMs)) hits.delete(k); }
  return true;
}

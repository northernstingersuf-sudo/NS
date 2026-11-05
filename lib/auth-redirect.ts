/** Tillåter bara interna sökvägar som mål efter inloggning (skydd mot open redirect). */
export function safeNext(next: string | null | undefined, fallback = "/konto"): string {
  return next && /^\/(?!\/)[A-Za-z0-9\-_/]*$/.test(next) ? next : fallback;
}

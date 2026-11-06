/** Canonical public URL. Set NEXT_PUBLIC_SITE_URL to the real production domain. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://northernstingers.store").replace(/\/+$/, "");

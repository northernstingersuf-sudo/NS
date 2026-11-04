import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service role-klient. ENDAST för serverkod som själv har kontrollerat behörighet
 * (kassa, gästorder via token, Discord-kö). Kringgår RLS. Importera aldrig från klientkomponenter.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY eller NEXT_PUBLIC_SUPABASE_URL saknas på servern.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const hasServiceRole = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

import { createClient } from "@supabase/supabase-js";

/** Cookiefri klient för publik data (produkter, kategorier). Gör att sidor kan cachas. RLS gäller fortfarande. */
export const createPublicClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

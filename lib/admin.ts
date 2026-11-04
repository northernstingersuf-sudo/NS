import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Server-side admin guard. Call this in every protected page and server action. */
export async function requireAdmin() {
  const sb = await createClient();
  const { data: { user }, error: userError } = await sb.auth.getUser();
  if (userError || !user) redirect("/logga-in");

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError || profile?.role !== "admin") redirect("/");

  return { sb, user };
}

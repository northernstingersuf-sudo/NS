"use server";
import { createClient } from "@/lib/supabase/server";

export type NewsState = { ok?: boolean; error?: string };

export async function subscribe(_: NewsState, f: FormData): Promise<NewsState> {
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Ange en giltig e-postadress." };
  if (f.get("consent") !== "on") return { error: "Du måste godkänna för att prenumerera." };
  const sb = await createClient();
  const { error } = await sb.from("newsletter_subscribers").insert({ email });
  if (error && error.code !== "23505") return { error: "Något gick fel. Försök igen senare." }; // 23505 = redan prenumerant, avslöjas inte
  return { ok: true };
}

"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { NEWSLETTER_CONSENT_TEXT, NEWSLETTER_CONSENT_VERSION } from "@/lib/newsletter-consent";

export type NewsState = { ok?: boolean; error?: string };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function subscribe(_: NewsState, f: FormData): Promise<NewsState> {
  // Honeypot: bot submissions are answered neutrally and are not stored.
  if (String(f.get("website") ?? "").trim()) return { ok: true };

  const email = String(f.get("email") ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return { error: "Ange en giltig e-postadress." };
  if (f.get("consent") !== "on") return { error: "Du måste aktivt godkänna nyhetsbrevet." };
  if (!rateLimit(`newsletter:${email}`, 3, 10 * 60_000)) return { error: "För många försök. Vänta en stund och försök igen." };

  try {
    const sb = createAdminClient();
    const { error } = await sb.from("newsletter_subscribers").upsert({
      email,
      consented_at: new Date().toISOString(),
      consent_source: "footer",
      consent_version: NEWSLETTER_CONSENT_VERSION,
      consent_text: NEWSLETTER_CONSENT_TEXT,
      unsubscribe_token: randomUUID(),
      unsubscribed_at: null,
    }, { onConflict: "email" });
    if (error) {
      console.error(`[newsletter] signup misslyckades (${error.code})`);
      return { error: "Anmälan kunde inte sparas just nu. Försök igen senare." };
    }
    return { ok: true };
  } catch (error) {
    console.error("[newsletter] service role saknas eller databasfel:", error instanceof Error ? error.name : "unknown");
    return { error: "Nyhetsbrevet är tillfälligt otillgängligt. Försök igen senare." };
  }
}

/** Avregistrering ändrar aldrig order- eller kontodata. GET-länkar muterar inte data; kunden måste bekräfta med POST. */
export async function unsubscribe(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!UUID.test(token)) redirect("/nyhetsbrev/avregistrerad?status=ogiltig");
  if (!rateLimit(`newsletter-unsubscribe:${token}`, 5, 10 * 60_000)) {
    redirect("/nyhetsbrev/avregistrerad?status=fel");
  }

  let result: "klart" | "ogiltig" | "fel" = "klart";
  try {
    const sb = createAdminClient();
    const { data, error } = await sb.from("newsletter_subscribers")
      .select("id,unsubscribed_at").eq("unsubscribe_token", token).maybeSingle();
    if (error) {
      result = "fel";
    } else if (!data) {
      result = "ogiltig";
    } else if (!data.unsubscribed_at) {
      const { error: updateError } = await sb.from("newsletter_subscribers")
        .update({ unsubscribed_at: new Date().toISOString() }).eq("id", data.id);
      if (updateError) {
        console.error(`[newsletter] avregistrering misslyckades (${updateError.code})`);
        result = "fel";
      }
    }
  } catch (error) {
    console.error("[newsletter] avregistrering kunde inte behandlas:", error instanceof Error ? error.name : "unknown");
    result = "fel";
  }
  redirect(`/nyhetsbrev/avregistrerad?status=${result}`);
}

"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { NEWSLETTER_CONSENT_TEXT, NEWSLETTER_CONSENT_VERSION } from "@/lib/newsletter-consent";
import { isValidFrom, sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

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
    const { data: existing, error: lookupError } = await sb.from("newsletter_subscribers")
      .select("id,confirmed_at,unsubscribed_at").eq("email", email).maybeSingle();
    if (lookupError) {
      console.error(`[newsletter] signup lookup misslyckades (${lookupError.code})`);
      return { error: "Anmälan kunde inte sparas just nu. Försök igen senare." };
    }
    // Do not silently reset an already confirmed, active subscriber.
    if (existing?.confirmed_at && !existing.unsubscribed_at) return { ok: true };

    const confirmationToken = randomUUID();
    const unsubscribeToken = randomUUID();
    const values = {
      email,
      consented_at: new Date().toISOString(),
      consent_source: "footer",
      consent_version: NEWSLETTER_CONSENT_VERSION,
      consent_text: NEWSLETTER_CONSENT_TEXT,
      unsubscribe_token: unsubscribeToken,
      unsubscribed_at: null,
      confirmed_at: null,
      confirmation_token: confirmationToken,
    };
    const { error } = await sb.from("newsletter_subscribers").upsert(values, { onConflict: "email" });
    if (error) {
      console.error(`[newsletter] signup misslyckades (${error.code})`);
      return { error: "Anmälan kunde inte sparas just nu. Försök igen senare." };
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !isValidFrom(from)) {
      console.error("[newsletter] bekräftelsemejl ej konfigurerat");
      return { error: "Anmälan sparades, men bekräftelsemejlet kunde inte skickas just nu. Försök igen senare." };
    }
    const confirmationUrl = `${SITE_URL}/nyhetsbrev/bekrafta/${confirmationToken}`;
    const subject = "Bekräfta din prenumeration – Northern Stingers";
    const text = [
      "Du har bett om att få nyheter och erbjudanden från Northern Stingers.",
      "Bekräfta din e-postadress genom att öppna länken nedan:",
      confirmationUrl,
      "Din prenumeration aktiveras först när du bekräftar. Om du inte gjorde denna anmälan kan du ignorera mejlet.",
      "Northern Stingers",
    ].join("\n\n");
    const safeUrl = confirmationUrl.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
    const html = `<!doctype html><html lang="sv"><body style="margin:0;background:#f5f5f4;font-family:Helvetica,Arial,sans-serif;color:#0a0a0a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;padding:32px"><tr><td><p style="margin:0 0 24px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#666">Northern Stingers</p><h1 style="font-size:24px;line-height:1.2">Bekräfta din prenumeration</h1><p style="line-height:1.6">Du har bett om att få nyheter och erbjudanden via e-post. Bekräfta din e-postadress för att aktivera prenumerationen.</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;background:#0a0a0a;color:#fff;padding:14px 20px;text-decoration:none">Bekräfta e-postadress</a></p><p style="line-height:1.6;font-size:13px;color:#666">Om du inte gjorde denna anmälan kan du ignorera mejlet. Inga nyhetsbrev skickas innan du bekräftar.</p></td></tr></table></td></tr></table></body></html>`;
    const result = await sendEmail({ apiKey, from, to: email, subject, html, text, replyTo: process.env.EMAIL_REPLY_TO?.trim() || "info@northernstingers.store", idempotencyKey: `newsletter-confirm:${confirmationToken}` });
    if (!result.ok) {
      console.error(`[newsletter] bekräftelsemejl misslyckades (${result.error})`);
      return { error: "Anmälan sparades, men bekräftelsemejlet kunde inte skickas. Kontrollera e-postadressen eller försök igen senare." };
    }
    return { ok: true };
  } catch (error) {
    console.error("[newsletter] service role saknas eller databasfel:", error instanceof Error ? error.name : "unknown");
    return { error: "Nyhetsbrevet är tillfälligt otillgängligt. Försök igen senare." };
  }
}

/** Aktiverar prenumerationen först efter att användaren skickat formuläret på bekräftelsesidan. */
export async function confirmNewsletter(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!UUID.test(token)) redirect("/nyhetsbrev/bekraftat?status=ogiltig");
  if (!rateLimit(`newsletter-confirm:${token}`, 5, 10 * 60_000)) redirect("/nyhetsbrev/bekraftat?status=fel");
  try {
    const sb = createAdminClient();
    const { data, error } = await sb.from("newsletter_subscribers")
      .select("id,confirmed_at,unsubscribed_at").eq("confirmation_token", token).maybeSingle();
    if (error) redirect("/nyhetsbrev/bekraftat?status=fel");
    if (!data) redirect("/nyhetsbrev/bekraftat?status=ogiltig");
    if (data.unsubscribed_at) redirect("/nyhetsbrev/bekraftat?status=ogiltig");
    if (data.confirmed_at) redirect("/nyhetsbrev/bekraftat?status=klart");
    const { error: updateError } = await sb.from("newsletter_subscribers")
      .update({ confirmed_at: new Date().toISOString(), confirmation_token: null })
      .eq("id", data.id).eq("confirmation_token", token).is("confirmed_at", null).is("unsubscribed_at", null);
    if (updateError) {
      console.error(`[newsletter] bekräftelse misslyckades (${updateError.code})`);
      redirect("/nyhetsbrev/bekraftat?status=fel");
    }
    redirect("/nyhetsbrev/bekraftat?status=klart");
  } catch (error) {
    // Next redirect() throws a control-flow exception; let it pass through.
    if (error && typeof error === "object" && "digest" in error) throw error;
    console.error("[newsletter] bekräftelse kunde inte behandlas:", error instanceof Error ? error.name : "unknown");
    redirect("/nyhetsbrev/bekraftat?status=fel");
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

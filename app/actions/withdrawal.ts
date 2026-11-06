"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { sendWithdrawalAcknowledgement } from "@/lib/withdrawals";
import { businessDetails } from "@/lib/business";

export type WithdrawalState = { ok?: boolean; error?: string; requestId?: string };
const CONTACT_EMAIL = businessDetails.email;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ORDER_NUMBER = /^NS-[0-9]{4}-[0-9]{6}$/i;

export async function requestWithdrawal(_: WithdrawalState, f: FormData): Promise<WithdrawalState> {
  if (String(f.get("website") ?? "").trim()) return { error: "Meddelandet kunde inte skickas." };

  const orderNumber = String(f.get("order_number") ?? "").trim().toUpperCase();
  const name = String(f.get("name") ?? "").trim();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const note = String(f.get("message") ?? "").trim().slice(0, 2000);
  if (!ORDER_NUMBER.test(orderNumber)) return { error: "Ange ordernumret i formatet NS-ÅÅÅÅ-NNNNNN." };
  if (name.length < 2 || name.length > 100) return { error: "Ange ditt namn (2–100 tecken)." };
  if (email.length > 254 || !EMAIL.test(email)) return { error: "Ange den e-postadress som användes vid köpet." };
  if (f.get("confirm_withdrawal") !== "on") return { error: "Bekräfta uttryckligen att du vill frånträda köpet." };
  if (!rateLimit(`withdrawal:${email}`, 5, 10 * 60_000)) return { error: "För många försök. Vänta en stund och försök igen." };

  try {
    const sb = createAdminClient();
    const { data: order, error: orderError } = await sb.from("orders")
      .select("id,order_number,email,shipping_address")
      .eq("order_number", orderNumber)
      .eq("email", email)
      .maybeSingle();
    if (orderError || !order) return { error: "Vi kunde inte hitta en order som matchar uppgifterna. Kontrollera ordernummer och e-postadress." };
    const shippingAddress = order.shipping_address as { name?: unknown } | null;
    const orderName = typeof shippingAddress?.name === "string" ? shippingAddress.name.trim().toLocaleLowerCase("sv-SE") : "";
    if (!orderName || orderName !== name.trim().toLocaleLowerCase("sv-SE")) {
      return { error: "Namnet stämmer inte med ordern. Kontrollera uppgifterna och försök igen." };
    }

    const receivedAt = new Date().toISOString();
    // Återanvänd ett nyligen inkommet ärende vid dubbelklick/nätverksretry.
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: recent } = await sb.from("withdrawal_requests")
      .select("id")
      .eq("order_id", order.id)
      .eq("customer_email", email)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let requestId = recent?.id as string | undefined;
    if (!requestId) {
      const { data: inserted, error: insertError } = await sb.from("withdrawal_requests").insert({
        order_id: order.id,
        order_number: order.order_number,
        customer_name: name,
        customer_email: email,
        message: note || null,
        received_at: receivedAt,
        status: "received",
      }).select("id").single();
      if (insertError || !inserted) {
        console.error(`[withdrawal] kunde inte registrera ångermeddelande (${insertError?.code ?? "no_row"})`);
        return { error: `Meddelandet kunde inte registreras just nu. Kontakta ${CONTACT_EMAIL}.` };
      }
      requestId = inserted.id;
    }
    if (!requestId) return { error: `Meddelandet kunde inte registreras. Kontakta ${CONTACT_EMAIL}.` };

    const receipt = await sendWithdrawalAcknowledgement(requestId);
    if (receipt === "sent" || receipt === "already_sent") return { ok: true, requestId };
    return { error: `Meddelandet har registrerats, men mottagningsbeviset kunde inte skickas. Kontakta ${CONTACT_EMAIL} så att vi kan bekräfta mottagandet.` };
  } catch (error) {
    console.error("[withdrawal] oväntat fel:", error instanceof Error ? error.name : "unknown");
    return { error: `Funktionen är tillfälligt otillgänglig. Kontakta ${CONTACT_EMAIL}.` };
  }
}

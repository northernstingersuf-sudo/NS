import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildEmail, isValidFrom, sendEmail, type EmailKind } from "@/lib/email";
import { normalizeSwishNumber } from "@/lib/swish";

export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY?.trim() && isValidFrom(process.env.EMAIL_FROM));

/**
 * Skickar ett kundmejl för en order, högst ett per (order, typ). Kastar aldrig: ett mejlfel får inte påverka ordern.
 * Status/fel sparas i email_log (admin kan försöka igen). API-nyckel och mottagare loggas aldrig.
 */
export async function notifyEmail(orderId: string, kind: EmailKind): Promise<"sent" | "failed" | "skipped"> {
  let sb: ReturnType<typeof createAdminClient>;
  try { sb = createAdminClient(); } catch { return "skipped"; }
  try {
    const { data: claimed, error } = await sb.rpc("claim_email", { p_order_id: orderId, p_kind: kind });
    if (error) { console.error(`[email] claim misslyckades (${error.code})`); return "skipped"; }
    if (!claimed) return "skipped";
    const finish = (ok: boolean, err?: string) => sb.rpc("finish_email", { p_order_id: orderId, p_kind: kind, p_ok: ok, p_error: err ?? null });

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    if (!apiKey || !isValidFrom(from)) { await finish(false, "not_configured"); return "failed"; }

    const { data: o, error: oErr } = await sb
      .from("orders")
      .select("order_number,email,guest_token,subtotal_ore,discount_ore,shipping_ore,total_ore,tracking_number,order_items(name,variant,quantity,unit_price_ore)")
      .eq("id", orderId)
      .maybeSingle();
    if (oErr || !o) { await finish(false, "order_not_found"); return "failed"; }

    const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
    const mail = buildEmail(kind, { ...o, order_number: o.order_number ?? orderId.slice(0, 8).toUpperCase(), items: o.order_items ?? [] }, {
      statusUrl: site ? `${site}/order/${o.guest_token}` : null,
      swishNumber: normalizeSwishNumber(process.env.SWISH_NUMBER),
    });
    const res = await sendEmail({ apiKey, from, to: o.email, ...mail, replyTo: process.env.EMAIL_REPLY_TO?.trim() || null, idempotencyKey: `${orderId}:${kind}` });
    await finish(res.ok, res.ok ? undefined : res.error);
    return res.ok ? "sent" : "failed";
  } catch (e) {
    console.error("[email] oväntat fel:", e instanceof Error ? e.name : "unknown");
    return "failed";
  }
}

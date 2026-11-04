import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDiscordPayload, isValidRoleId, isValidWebhookUrl, sendDiscord, type NoticeKind, type NoticeOrder } from "@/lib/discord";

export type NotifyOutcome = "sent" | "failed" | "skipped";

/**
 * Skickar en Discord-notis för en order, högst en gång per (order, typ).
 * Kastar aldrig: ett Discord-fel får inte avbryta eller radera ordern. Status/fel sparas i notification_log
 * så att admin kan se misslyckade utskick och försöka igen. Webhook-URL:en loggas aldrig.
 */
export async function notifyOrder(orderId: string, kind: NoticeKind): Promise<NotifyOutcome> {
  let sb: ReturnType<typeof createAdminClient>;
  try { sb = createAdminClient(); } catch { console.error("[discord] service role saknas, notis hoppades över"); return "skipped"; }

  try {
    const { data: claimed, error } = await sb.rpc("claim_notification", { p_order_id: orderId, p_kind: kind });
    if (error) { console.error(`[discord] claim misslyckades (${error.code})`); return "skipped"; }
    if (!claimed) return "skipped"; // redan skickad eller pågår

    const finish = (ok: boolean, err?: string) => sb.rpc("finish_notification", { p_order_id: orderId, p_kind: kind, p_ok: ok, p_error: err ?? null });

    const webhook = process.env.DISCORD_WEBHOOK_URL?.trim();
    const roleId = process.env.DISCORD_ROLE_ID?.trim();
    if (!isValidWebhookUrl(webhook) || !isValidRoleId(roleId)) {
      await finish(false, "not_configured");
      return "failed";
    }

    const { data: order, error: orderErr } = await sb
      .from("orders")
      .select("id,order_number,created_at,subtotal_ore,discount_ore,shipping_ore,total_ore,order_items(name,variant,quantity,unit_price_ore)")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr || !order) { await finish(false, "order_not_found"); return "failed"; }

    const notice: NoticeOrder = { ...order, order_number: order.order_number ?? order.id.slice(0, 8).toUpperCase(), items: order.order_items ?? [] };
    const payload = buildDiscordPayload(kind, notice, { roleId, siteUrl: process.env.NEXT_PUBLIC_SITE_URL });
    const result = await sendDiscord(webhook, payload);
    await finish(result.ok, result.ok ? undefined : result.error);
    return result.ok ? "sent" : "failed";
  } catch (e) {
    console.error("[discord] oväntat fel:", e instanceof Error ? e.name : "unknown");
    return "failed";
  }
}

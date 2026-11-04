/**
 * Discord-ordernotiser via incoming webhook. Ren logik (payload + sändning) utan beroenden på Supabase.
 * Integritet: skickar bara ordernummer, produkter, belopp och betalstatus. Aldrig adress, telefon eller e-post.
 * Webhook-URL och roll-ID är hemligheter/konfiguration på servern och loggas aldrig.
 */

export type NoticeKind = "order_created" | "payment_reported" | "payment_verified";
export type NoticeOrder = {
  id: string;
  order_number: string;
  created_at: string;
  subtotal_ore: number;
  discount_ore: number;
  shipping_ore: number;
  total_ore: number;
  items: { name: string; variant: string | null; quantity: number; unit_price_ore: number }[];
};

const WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d{5,}\/[\w-]{10,}$/;
export const isValidWebhookUrl = (u: string | undefined | null): u is string => !!u && WEBHOOK_RE.test(u.trim());
export const isValidRoleId = (id: string | undefined | null): id is string => !!id && /^\d{5,25}$/.test(id.trim());

const kr = (ore: number) => `${(ore / 100).toLocaleString("sv-SE", { minimumFractionDigits: ore % 100 ? 2 : 0, maximumFractionDigits: 2 })} kr`;
// Produktnamn är admin-styrda, men neutralisera ändå Markdown/mentions i textfält.
const plain = (s: string) => s.replace(/[`*_~|>@\\]/g, "").slice(0, 120);
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function buildDiscordPayload(kind: NoticeKind, order: NoticeOrder, opts: { roleId: string; siteUrl?: string | null }) {
  const lines = order.items.map((i) => `${i.quantity} × ${plain(i.name)}${i.variant ? ` (${plain(i.variant)})` : ""} – ${kr(i.unit_price_ore * i.quantity)}`);
  let items = lines.join("\n");
  if (items.length > 1000) items = `${items.slice(0, 990).replace(/\n[^\n]*$/, "")}\n…`;

  const adminUrl = opts.siteUrl ? `${opts.siteUrl.replace(/\/+$/, "")}/admin/ordrar/${order.id}` : null;
  const TITLES: Record<NoticeKind, string> = {
    order_created: "Ny beställning – inväntar Swishbetalning",
    payment_reported: "Kunden har rapporterat betalning – kontroll krävs",
    payment_verified: "Betalning verifierad – redo att packa",
  };
  const PAYMENT: Record<NoticeKind, string> = {
    order_created: "Ej verifierad",
    payment_reported: "Rapporterad av kund – ej verifierad",
    payment_verified: "Verifierad av admin ✅",
  };
  const title = TITLES[kind];
  const fields = [
    { name: "Ordernummer", value: order.order_number, inline: true },
    { name: "Totalt", value: kr(order.total_ore), inline: true },
    { name: "Betalning", value: PAYMENT[kind], inline: true },
    { name: "Produkter", value: items || "–" },
    { name: "Delsumma", value: kr(order.subtotal_ore), inline: true },
    ...(order.discount_ore > 0 ? [{ name: "Rabatt", value: `−${kr(order.discount_ore)}`, inline: true }] : []),
    { name: "Frakt", value: kr(order.shipping_ore), inline: true },
    ...(adminUrl ? [{ name: "Adminlänk", value: adminUrl }] : []),
  ];
  return {
    // Riktig rollmention: texten <@&ID> OCH allowed_mentions.roles. parse: [] hindrar alla andra mentions.
    content: `<@&${opts.roleId}> ${title} – ${order.order_number}`,
    allowed_mentions: { parse: [] as string[], roles: [opts.roleId] },
    embeds: [{ title: cut(title, 250), color: kind === "payment_verified" ? 0x16a34a : kind === "order_created" ? 0x0a0a0a : 0xd97706, timestamp: new Date(order.created_at).toISOString(), fields }],
  };
}

export type SendResult = { ok: true } | { ok: false; error: string };

/** Skickar till Discord. Felkoder är korta och innehåller aldrig URL:en. */
export async function sendDiscord(webhookUrl: string, payload: unknown, opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<SendResult> {
  const f = opts.fetchImpl ?? fetch;
  try {
    const res = await f(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
      cache: "no-store",
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: res.status === 429 ? "discord_rate_limited" : `discord_http_${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "discord_timeout" : "discord_network_error" };
  }
}

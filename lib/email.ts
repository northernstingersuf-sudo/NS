/**
 * Transaktionsmejl (orderbekräftelse, betalning verifierad, order skickad) via Resend.
 * Ren logik: bygger innehåll och skickar. Ingen databas här.
 * Allt dynamiskt innehåll HTML-escapas. Mejlen innehåller aldrig adress eller telefonnummer.
 */

export type EmailKind = "order_confirmation" | "payment_verified" | "order_shipped";
export type EmailOrder = {
  order_number: string;
  subtotal_ore: number;
  discount_ore: number;
  shipping_ore: number;
  total_ore: number;
  tracking_number?: string | null;
  items: { name: string; variant: string | null; quantity: number; unit_price_ore: number }[];
};
export type BuiltEmail = { subject: string; html: string; text: string };

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const kr = (ore: number) => `${(ore / 100).toLocaleString("sv-SE", { minimumFractionDigits: ore % 100 ? 2 : 0, maximumFractionDigits: 2 })} kr`;

/** "namn@domän.se" eller "Namn <namn@domän.se>". Inga radbrytningar. */
export const isValidFrom = (v: string | undefined | null): v is string =>
  !!v && !/[\r\n]/.test(v) && /^(?:[^<>@\r\n]+<[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>|[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)$/.test(v.trim());

const COPY: Record<EmailKind, { subject: (n: string) => string; heading: string; lead: string }> = {
  order_confirmation: {
    subject: (n) => `Vi har tagit emot din beställning ${n}`,
    heading: "Tack för din beställning",
    lead: "Vi har tagit emot din beställning. Den behandlas först när vi har kontrollerat att din Swish-betalning har kommit in.",
  },
  payment_verified: {
    subject: (n) => `Din betalning är mottagen – ${n}`,
    heading: "Betalningen är mottagen",
    lead: "Vi har kontrollerat din betalning och förbereder nu din order.",
  },
  order_shipped: {
    subject: (n) => `Din beställning är skickad – ${n}`,
    heading: "Din beställning är skickad",
    lead: "Din order är på väg.",
  },
};

export function buildEmail(kind: EmailKind, order: EmailOrder, opts: { statusUrl: string | null; swishNumber?: string | null }): BuiltEmail {
  const c = COPY[kind];
  const rows = order.items.map((i) => ({ label: `${i.quantity} × ${i.name}${i.variant ? ` – ${i.variant}` : ""}`, amount: kr(i.unit_price_ore * i.quantity) }));
  const sums = [
    { label: "Delsumma", amount: kr(order.subtotal_ore) },
    ...(order.discount_ore > 0 ? [{ label: "Rabatt", amount: `−${kr(order.discount_ore)}` }] : []),
    { label: "Frakt", amount: order.shipping_ore === 0 ? "Fri frakt" : kr(order.shipping_ore) },
  ];

  const extraText: string[] = [];
  const extraHtml: string[] = [];
  if (kind === "order_confirmation") {
    const pay = [`Belopp: ${kr(order.total_ore)}`, `Meddelande/referens: ${order.order_number}`, ...(opts.swishNumber ? [`Swish-nummer: ${opts.swishNumber}`] : [])];
    extraText.push("Betala med Swish:", ...pay, "Ange exakt belopp och referens så att vi hittar din betalning.");
    extraHtml.push(`<p style="margin:24px 0 4px;font-weight:600">Betala med Swish</p><p style="margin:0;line-height:1.6">${pay.map(esc).join("<br>")}</p><p style="margin:8px 0 0;font-size:13px;color:#666">Ange exakt belopp och referens så att vi hittar din betalning.</p>`);
  }
  if (kind === "order_shipped") {
    const t = order.tracking_number ? `Spårningsnummer: ${order.tracking_number}` : "Spårningsnummer har inte angivits.";
    extraText.push(t);
    extraHtml.push(`<p style="margin:24px 0 0;line-height:1.6">${esc(t)}</p>`);
  }

  const link = opts.statusUrl;
  const text = [
    c.heading, "", c.lead, "", `Ordernummer: ${order.order_number}`, "",
    ...rows.map((r) => `${r.label}  ${r.amount}`), "",
    ...sums.map((r) => `${r.label}: ${r.amount}`), `Totalt: ${kr(order.total_ore)}`, "",
    ...extraText, ...(extraText.length ? [""] : []),
    ...(link ? [`Följ din order: ${link}`, "(Spara länken. Den är din orderstatus.)", ""] : []),
    "Northern Stingers",
  ].join("\n");

  const tr = (l: string, a: string, bold = false) => `<tr><td style="padding:6px 0;${bold ? "font-weight:600;" : ""}">${esc(l)}</td><td style="padding:6px 0;text-align:right;white-space:nowrap;${bold ? "font-weight:600;" : ""}">${esc(a)}</td></tr>`;
  const html = `<!doctype html><html lang="sv"><body style="margin:0;background:#f5f5f4;font-family:Helvetica,Arial,sans-serif;color:#0a0a0a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;padding:32px">
<tr><td>
<p style="margin:0 0 24px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#666">Northern Stingers</p>
<h1 style="margin:0 0 12px;font-size:26px;line-height:1.2">${esc(c.heading)}</h1>
<p style="margin:0 0 20px;line-height:1.6">${esc(c.lead)}</p>
<p style="margin:0 0 16px;font-size:13px;color:#666">Ordernummer <strong style="color:#0a0a0a">${esc(order.order_number)}</strong></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #e5e5e5;border-bottom:1px solid #e5e5e5">${rows.map((r) => tr(r.label, r.amount)).join("")}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-top:8px">${sums.map((r) => tr(r.label, r.amount)).join("")}${tr("Totalt", kr(order.total_ore), true)}</table>
${extraHtml.join("")}
${link ? `<p style="margin:28px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:14px 22px;font-size:14px">Följ din order</a></p><p style="margin:12px 0 0;font-size:12px;color:#666">Spara länken. Den är din orderstatus.</p>` : ""}
</td></tr></table></td></tr></table></body></html>`;

  return { subject: c.subject(order.order_number), html, text };
}

export type SendEmailInput = { apiKey: string; from: string; to: string; subject: string; html: string; text: string; replyTo?: string | null; idempotencyKey: string };
export type SendResult = { ok: true } | { ok: false; error: string };

/** Skickar via Resend. Felkoder är korta och innehåller aldrig API-nyckel eller mottagaradress. */
export async function sendEmail(input: SendEmailInput, opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<SendResult> {
  const f = opts.fetchImpl ?? fetch;
  try {
    const res = await f("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json", "idempotency-key": input.idempotencyKey },
      body: JSON.stringify({ from: input.from, to: [input.to], subject: input.subject, html: input.html, text: input.text, ...(input.replyTo ? { reply_to: input.replyTo } : {}) }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
      cache: "no-store",
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: res.status === 429 ? "email_rate_limited" : res.status === 401 || res.status === 403 ? "email_auth_failed" : `email_http_${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "TimeoutError" ? "email_timeout" : "email_network_error" };
  }
}

/** Mottagningsbevis för konsumentens ångermeddelande enligt distansavtalslagen. */
export function buildWithdrawalReceipt(input: { orderNumber: string; customerName: string; receivedAt: string; siteUrl: string }): BuiltEmail {
  const when = new Date(input.receivedAt).toLocaleString("sv-SE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Stockholm" });
  const safeName = esc(input.customerName);
  const safeOrder = esc(input.orderNumber);
  const safeWhen = esc(when);
  const safeSite = esc(input.siteUrl);
  const subject = `Mottagningsbevis för ångermeddelande – ${input.orderNumber}`;
  const text = [
    "Vi har tagit emot ditt ångermeddelande.",
    `Namn: ${input.customerName}`,
    `Ordernummer: ${input.orderNumber}`,
    `Mottaget: ${when} (svensk tid)`,
    "Detta mejl är ett mottagningsbevis. Det bekräftar tidpunkten då ditt meddelande kom in, men innebär inte i sig att en återbetalning har genomförts.",
    `Northern Stingers – ${input.siteUrl}`,
  ].join("\n\n");
  const html = `<!doctype html><html lang="sv"><body style="margin:0;background:#f5f5f4;font-family:Helvetica,Arial,sans-serif;color:#0a0a0a"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;padding:32px"><tr><td><p style="margin:0 0 24px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#666">Northern Stingers</p><h1 style="font-size:24px;line-height:1.2">Vi har tagit emot ditt ångermeddelande</h1><p style="line-height:1.6">Hej ${safeName}, vi bekräftar att vi har tagit emot ditt meddelande om att frånträda köpet.</p><p style="line-height:1.8"><strong>Ordernummer:</strong> ${safeOrder}<br><strong>Mottaget:</strong> ${safeWhen} (svensk tid)</p><p style="line-height:1.6">Det här mejlet är ett mottagningsbevis. Det bekräftar tidpunkten då ditt meddelande kom in, men innebär inte i sig att en återbetalning har genomförts.</p><p style="font-size:13px;color:#666"><a href="${safeSite}">${safeSite}</a></p></td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}

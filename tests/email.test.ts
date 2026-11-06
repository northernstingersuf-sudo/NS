import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEmail, buildWithdrawalReceipt, esc, isValidFrom, sendEmail, type EmailOrder } from "../lib/email";

const order: EmailOrder = {
  order_number: "NS-2026-001003", subtotal_ore: 7000, discount_ore: 700, shipping_ore: 4900, total_ore: 11200, tracking_number: "SE123456789",
  items: [{ name: 'Kedje <b>Stinger</b> & "Co"', variant: "MEDIUM", quantity: 2, unit_price_ore: 3500 }],
};
const url = "https://northernstingers.store/order/0f8fad5b-d9cb-469f-a165-70867728950e";

test("orderbekräftelse: ämne, ordernummer, Swish-uppgifter, statuslänk, ingen betalningsbekräftelse", () => {
  const m = buildEmail("order_confirmation", order, { statusUrl: url, swishNumber: "1231234567" });
  assert.equal(m.subject, "Vi har tagit emot din beställning NS-2026-001003");
  for (const part of [m.html, m.text]) {
    assert.ok(part.includes("NS-2026-001003") && part.includes("1231234567") && part.includes(url));
    assert.ok(part.includes("112 kr") || part.includes("112\u00a0kr"), "total 112 kr");
  }
  assert.ok(m.text.includes("kontrollerat att din Swish-betalning"), "säger att betalning kontrolleras");
  assert.ok(!/betalningen är mottagen|betald/i.test(m.text), "påstår inte att betalning är mottagen");
});
test("betalning verifierad och skickad: rätt ämnen, spårningsnummer, inga Swish-instruktioner", () => {
  const v = buildEmail("payment_verified", order, { statusUrl: url, swishNumber: "1231234567" });
  assert.equal(v.subject, "Din betalning är mottagen – NS-2026-001003");
  assert.ok(!v.text.includes("1231234567"));
  const s = buildEmail("order_shipped", order, { statusUrl: url });
  assert.equal(s.subject, "Din beställning är skickad – NS-2026-001003");
  assert.ok(s.text.includes("SE123456789") && s.html.includes("SE123456789"));
  assert.ok(buildEmail("order_shipped", { ...order, tracking_number: null }, { statusUrl: url }).text.includes("inte angivits"));
});
test("HTML-injektion i produktnamn escapas; textversionen är ren text", () => {
  const m = buildEmail("order_confirmation", order, { statusUrl: url });
  assert.ok(!m.html.includes("<b>Stinger</b>") && m.html.includes("&lt;b&gt;Stinger&lt;/b&gt;") && m.html.includes("&amp;"));
  assert.equal(esc(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});
test("ingen adress/telefon/e-post i innehållet, länk utelämnas utan sajt-URL", () => {
  const m = buildEmail("order_confirmation", order, { statusUrl: null });
  assert.ok(!m.html.includes("Följ din order") && !m.text.includes("Följ din order"));
  assert.ok(!/@/.test(m.text.replace("Northern Stingers", "")));
});
test("rabatt och fri frakt visas korrekt", () => {
  const m = buildEmail("payment_verified", { ...order, shipping_ore: 0 }, { statusUrl: url });
  assert.ok(m.text.includes("Rabatt: −7 kr") && m.text.includes("Fri frakt"));
});
test("avsändarvalidering", () => {
  assert.ok(isValidFrom("order@northernstingers.store"));
  assert.ok(isValidFrom("Northern Stingers <order@northernstingers.store>"));
  for (const bad of ["", "inte en adress", "Namn <x>", "a@b.se\nBcc: x@y.se", "Namn <a@b.se>\r\n"]) assert.ok(!isValidFrom(bad), JSON.stringify(bad));
  assert.ok(!isValidFrom(undefined));
});
test("sändning: rätt anrop till Resend, felkoder utan hemligheter", async () => {
  const input = { apiKey: "re_SECRETKEY123", from: "a@b.se", to: "kund@test.se", subject: "S", html: "<p>x</p>", text: "x", idempotencyKey: "o1:order_confirmation" };
  let seen: { url?: string; headers?: Record<string, string>; body?: any } = {};
  const ok = await sendEmail(input, { fetchImpl: async (u, init) => { seen = { url: String(u), headers: init?.headers as Record<string, string>, body: JSON.parse(String(init?.body)) }; return new Response("{}", { status: 200 }); } });
  assert.deepEqual(ok, { ok: true });
  assert.equal(seen.url, "https://api.resend.com/emails");
  assert.equal(seen.headers?.authorization, "Bearer re_SECRETKEY123");
  assert.equal(seen.headers?.["idempotency-key"], "o1:order_confirmation");
  assert.deepEqual(seen.body.to, ["kund@test.se"]);
  const cases: [Response | Error, string][] = [
    [new Response("x", { status: 401 }), "email_auth_failed"], [new Response("x", { status: 429 }), "email_rate_limited"], [new Response("x", { status: 500 }), "email_http_500"],
    [Object.assign(new Error("t"), { name: "TimeoutError" }), "email_timeout"], [new Error("boom re_SECRETKEY123 kund@test.se"), "email_network_error"],
  ];
  for (const [r, code] of cases) {
    const res = await sendEmail(input, { fetchImpl: async () => { if (r instanceof Error) throw r; return r; } });
    assert.deepEqual(res, { ok: false, error: code });
    assert.ok(!JSON.stringify(res).includes("SECRET") && !JSON.stringify(res).includes("kund@"));
  }
});

test("mottagningsbevis för ångermeddelande innehåller order, namn och registrerad tid", () => {
  const receipt = buildWithdrawalReceipt({
    orderNumber: "NS-2026-001004",
    customerName: "Anna Andersson",
    receivedAt: "2026-11-06T13:15:00.000Z",
    siteUrl: "https://northernstingers.store",
  });
  assert.ok(receipt.subject.includes("NS-2026-001004"));
  for (const content of [receipt.text, receipt.html]) {
    assert.ok(content.includes("Anna Andersson"));
    assert.ok(content.includes("NS-2026-001004"));
    assert.ok(content.includes("Mottaget"));
    assert.ok(content.includes("mottagningsbevis"));
  }
  assert.ok(receipt.text.includes("innebär inte i sig att en återbetalning har genomförts"));
});

test("mottagningsbevis HTML-escapar användarnamn och URL", () => {
  const receipt = buildWithdrawalReceipt({
    orderNumber: "NS-2026-001005",
    customerName: "<script>alert(1)</script>",
    receivedAt: "2026-11-06T13:15:00.000Z",
    siteUrl: 'https://example.test/?x="y"&z=1',
  });
  assert.ok(!receipt.html.includes("<script>"));
  assert.ok(receipt.html.includes("&lt;script&gt;"));
  assert.ok(receipt.html.includes("&quot;y&quot;&amp;z=1"));
});

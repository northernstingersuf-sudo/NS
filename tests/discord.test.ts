import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDiscordPayload, isValidRoleId, isValidWebhookUrl, sendDiscord, type NoticeOrder } from "../lib/discord";

const order: NoticeOrder = {
  id: "11111111-1111-1111-1111-111111111111", order_number: "NS-2026-001000", created_at: "2026-11-04T10:00:00Z",
  subtotal_ore: 7000, discount_ore: 700, shipping_ore: 4900, total_ore: 11200,
  items: [{ name: "Kedje *Stinger* @everyone", variant: "MEDIUM", quantity: 2, unit_price_ore: 3500 }],
};

test("rollping är en riktig mention + allowed_mentions", () => {
  const p = buildDiscordPayload("order_created", order, { roleId: "123456789012345678", siteUrl: "https://northernstingers.se/" });
  assert.ok(p.content.startsWith("<@&123456789012345678>"));
  assert.deepEqual(p.allowed_mentions, { parse: [], roles: ["123456789012345678"] });
});
test("innehåll: ordernummer, rader, belopp, ej verifierad, adminlänk", () => {
  const json = JSON.stringify(buildDiscordPayload("order_created", order, { roleId: "123456789012345678", siteUrl: "https://northernstingers.se/" }));
  for (const s of ["Ny beställning – inväntar Swishbetalning", "NS-2026-001000", "2 × Kedje Stinger", "MEDIUM", "Ej verifierad", "https://northernstingers.se/admin/ordrar/" + order.id]) assert.ok(json.includes(s), s);
});
test("markdown/mentions i produktnamn neutraliseras", () => {
  const json = JSON.stringify(buildDiscordPayload("order_created", order, { roleId: "123456789012345678" }));
  assert.ok(!json.includes("@everyone") && !json.includes("*Stinger*"));
});
test("rapporterad betalning ger separat rubrik och ändrar inget påstående om betalning", () => {
  const p = buildDiscordPayload("payment_reported", order, { roleId: "123456789012345678" });
  assert.equal(p.embeds[0].title, "Kunden har rapporterat betalning – kontroll krävs");
  assert.ok(JSON.stringify(p).includes("ej verifierad"));
});
test("verifierad betalning ger grön notis med rätt rubrik och status", () => {
  const p = buildDiscordPayload("payment_verified", order, { roleId: "123456789012345678" });
  assert.equal(p.embeds[0].title, "Betalning verifierad – redo att packa");
  assert.equal(p.embeds[0].color, 0x16a34a);
  const json = JSON.stringify(p);
  assert.ok(json.includes("Verifierad av admin") && !json.includes("Ej verifierad"));
  assert.ok(p.content.includes("NS-2026-001000"));
});
test("skickad order: blå notis med spårningsnummer, utan persondata", () => {
  const p = buildDiscordPayload("order_shipped", { ...order, tracking_number: "SE123456789" }, { roleId: "123456789012345678" });
  assert.equal(p.embeds[0].title, "Order skickad");
  assert.equal(p.embeds[0].color, 0x2563eb);
  assert.ok(JSON.stringify(p).includes("SE123456789"));
  assert.ok(JSON.stringify(buildDiscordPayload("order_shipped", order, { roleId: "123456789012345678" })).includes("Ej angivet"));
});
test("ingen persondata i payloaden (adress, e-post, telefon)", () => {
  const json = JSON.stringify(buildDiscordPayload("order_created", order, { roleId: "123456789012345678" }));
  assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(json.replace("@everyone", "")));
});
test("lång orderlista kapas inom Discords fältgräns", () => {
  const many = { ...order, items: Array.from({ length: 80 }, (_, i) => ({ name: `Produkt nummer ${i}`, variant: "LARGE", quantity: 1, unit_price_ore: 100 })) };
  const p = buildDiscordPayload("order_created", many, { roleId: "123456789012345678" });
  assert.ok(p.embeds[0].fields.every((f) => f.value.length <= 1024));
});
test("webhook- och roll-validering", () => {
  assert.ok(isValidWebhookUrl("https://discord.com/api/webhooks/123456789012345678/abcDEF_ghi-123456789"));
  assert.ok(!isValidWebhookUrl("https://evil.example/api/webhooks/123456789012345678/abcDEF_ghi-123456789"));
  assert.ok(!isValidWebhookUrl("http://discord.com/api/webhooks/123456789012345678/abcDEF_ghi-123456789"));
  assert.ok(!isValidWebhookUrl("DIN_DISCORD_WEBHOOK_URL"));
  assert.ok(isValidRoleId("123456789012345678"));
  assert.ok(!isValidRoleId("DISCORD_ROLLENS_ID"));
});
test("sändning: ok, HTTP-fel, timeout och nätverksfel läcker aldrig URL:en", async () => {
  const url = "https://discord.com/api/webhooks/123456789012345678/SECRETTOKEN1234567";
  const ok = await sendDiscord(url, {}, { fetchImpl: async () => new Response(null, { status: 204 }) });
  assert.deepEqual(ok, { ok: true });
  const http = await sendDiscord(url, {}, { fetchImpl: async () => new Response("x", { status: 500 }) });
  assert.deepEqual(http, { ok: false, error: "discord_http_500" });
  const rl = await sendDiscord(url, {}, { fetchImpl: async () => new Response("x", { status: 429 }) });
  assert.deepEqual(rl, { ok: false, error: "discord_rate_limited" });
  const net = await sendDiscord(url, {}, { fetchImpl: async () => { throw new Error(`boom ${url}`); } });
  assert.deepEqual(net, { ok: false, error: "discord_network_error" });
  const to = await sendDiscord(url, {}, { fetchImpl: async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; } });
  assert.deepEqual(to, { ok: false, error: "discord_timeout" });
  assert.ok(![ok, http, rl, net, to].some((r) => JSON.stringify(r).includes("SECRETTOKEN")));
});

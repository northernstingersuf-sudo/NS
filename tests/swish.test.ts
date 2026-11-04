import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSwishAppLink, buildSwishHttpsLink, buildSwishQrPayload, formatSwishAmount, normalizeSwishNumber, sanitizeSwishMessage } from "../lib/swish";
import { parseSekToOre } from "../lib/money";

const input = { payee: "1234567890", amountOre: 24900, message: "NS-2026-000123" };

test("QR-payload följer C<payee>;<amount>;<message>;<lock>", () => {
  assert.equal(buildSwishQrPayload(input), "C1234567890;249,00;NS-2026-000123;0");
});
test("belopp formateras utan flyttal", () => {
  assert.equal(formatSwishAmount(5), "0,05");
  assert.equal(formatSwishAmount(100), "1,00");
  assert.equal(formatSwishAmount(17550), "175,50");
  assert.throws(() => formatSwishAmount(0));
  assert.throws(() => formatSwishAmount(-100));
  assert.throws(() => formatSwishAmount(10.5));
});
test("nummer valideras och normaliseras", () => {
  assert.equal(normalizeSwishNumber("123 123 45-67"), "1231234567");
  assert.equal(normalizeSwishNumber("+46701234567"), "46701234567");
  assert.equal(normalizeSwishNumber("DITT_SWISH_FORETAGSNUMMER"), null);
  assert.equal(normalizeSwishNumber(""), null);
  assert.equal(normalizeSwishNumber(undefined), null);
  assert.throws(() => buildSwishQrPayload({ ...input, payee: "abc" }));
});
test("meddelandet saneras så att ; inte kan injicera fält", () => {
  assert.equal(sanitizeSwishMessage("NS-1;999,00;x"), "NS-1999,00x");
  const p = buildSwishQrPayload({ ...input, message: "A;B;0" });
  assert.equal(p.split(";").length, 4);
});
test("appLink är låst (editable:false) och bär mottagare, belopp, referens", () => {
  const link = buildSwishAppLink(input);
  assert.ok(link.startsWith("swish://payment?data="));
  const data = JSON.parse(decodeURIComponent(link.slice("swish://payment?data=".length)));
  assert.deepEqual(data, { version: 1, payee: { value: "1234567890", editable: false }, amount: { value: 249, editable: false }, message: { value: "NS-2026-000123", editable: false } });
});
test("https-länk har decimalpunkt och SEK", () => {
  const u = new URL(buildSwishHttpsLink(input));
  assert.equal(u.hostname, "app.swish.nu");
  assert.equal(u.searchParams.get("amt"), "249.00");
  assert.equal(u.searchParams.get("cur"), "SEK");
  assert.equal(u.searchParams.get("sw"), "1234567890");
  assert.equal(u.searchParams.get("msg"), "NS-2026-000123");
});
test("ingen Swish-endpoint anropas: modulen har inga nätverksberoenden", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("../lib/swish.ts", import.meta.url), "utf8"));
  assert.ok(!/\bfetch\s*\(/.test(src) && !/XMLHttpRequest|swish\.nu\/api|mss\.cpc\.getswish/.test(src));
});
test("parseSekToOre", () => {
  assert.equal(parseSekToOre("318"), 31800);
  assert.equal(parseSekToOre("318,5"), 31850);
  assert.equal(parseSekToOre("318.05"), 31805);
  for (const bad of ["", "-1", "1,234", "abc", "1e3", "1,2,3"]) assert.equal(parseSekToOre(bad), null, bad);
});

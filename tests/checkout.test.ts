import { test } from "node:test";
import assert from "node:assert/strict";
import { describeOrderError, validateCheckout } from "../lib/checkout";

const good = {
  idempotencyKey: "0f8fad5b-d9cb-469f-a165-70867728950e", email: " Kund@Test.SE ", name: "Anna Svensson", phone: "", line1: "Storgatan 1", line2: "",
  postalCode: "11122", city: "Stockholm", discountCode: "", items: [{ id: "0f8fad5b-d9cb-469f-a165-70867728950e", qty: 2 }],
};

test("giltig kassa normaliseras", () => {
  const r = validateCheckout(good);
  assert.ok(r.ok);
  if (r.ok) { assert.equal(r.value.email, "kund@test.se"); assert.equal(r.value.address.postal_code, "111 22"); assert.equal(r.value.address.country, "SE"); assert.equal(r.value.discountCode, null); }
});
test("pris/total från klienten ignoreras (finns inte i resultatet)", () => {
  const r = validateCheckout({ ...good, items: [{ id: good.items[0].id, qty: 1, price_ore: 1, total_ore: 1 }], total_ore: 1 });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(Object.keys(r.value.items[0]).sort(), ["id", "qty"]);
});
test("ogiltiga fält ger fältfel", () => {
  const r = validateCheckout({ ...good, email: "x", postalCode: "12", name: "", items: [{ id: "nej", qty: 1 }] });
  assert.ok(!r.ok);
  if (!r.ok) for (const k of ["email", "postalCode", "name", "items"]) assert.ok(r.errors[k], k);
});
test("antal måste vara heltal 1–99, tom korg nekas, kort nyckel nekas", () => {
  for (const qty of [0, 100, 1.5, -1, NaN]) assert.ok(!validateCheckout({ ...good, items: [{ id: good.items[0].id, qty }] }).ok, String(qty));
  assert.ok(!validateCheckout({ ...good, items: [] }).ok);
  assert.ok(!validateCheckout({ ...good, idempotencyKey: "kort" }).ok);
  assert.ok(!validateCheckout(null).ok);
});
test("databasfel översätts utan att läcka detaljer", () => {
  assert.equal(describeOrderError("insufficient_stock", "Fiskevåg").code, "stock");
  assert.equal(describeOrderError("shipping_not_configured").code, "closed");
  assert.equal(describeOrderError("invalid_discount").code, "discount");
  const u = describeOrderError('relation "orders" does not exist');
  assert.equal(u.code, "unknown");
  assert.ok(!u.message.includes("relation"));
});

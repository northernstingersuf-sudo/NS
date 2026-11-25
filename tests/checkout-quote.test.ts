import { test } from "node:test";
import assert from "node:assert/strict";
import type { StockBalance } from "../lib/stock";
import { calculateCheckoutQuote, validateQuoteRequest } from "../lib/checkout-quote";

const A = "0f8fad5b-d9cb-469f-a165-70867728950e";
const B = "a36a584c-e2f8-4e30-b5e8-7318f0d7f99c";
const V = "7182c726-48b0-4218-b0aa-48faf3ee37d6";
const product = { id: A, name_sv: "Fiskevåg", price_ore: 19900, in_stock: true, active: true };
const variantProduct = { id: B, name_sv: "Stinger", price_ore: 2900, in_stock: true, active: true };
const variant = { id: V, product_id: B, label: "MEDIUM", price_ore: 3500, active: true, in_stock: true };
const basic = () => ({
  items: [{ id: A, qty: 1 }], products: [product, variantProduct], variants: [variant],
  activeVariantProductIds: [B], inventory: [] as StockBalance[],
  discountCode: null as string | null,
  discount: null as { percent: number | null; amount_ore: number | null; active: boolean; expires_at: string | null; max_uses: number | null; used: number } | null,
  shipping: { flat_ore: 4900, free_over_ore: 50000 as number | null },
  now: Date.parse("2026-11-20T12:00:00Z"),
});
const good = (quote: ReturnType<typeof calculateCheckoutQuote>) => {
  if (!quote.ok) throw new Error(`Expected a valid checkout quote: ${quote.error}`);
  return quote;
};
const bad = (quote: ReturnType<typeof calculateCheckoutQuote>) => assert.equal(quote.ok, false);

test("quote validation rejects empty, malformed, excessive quantities and discount codes", () => {
  badInput([]);
  badInput([{ id: A, qty: 0 }]);
  badInput([{ id: A, qty: 1.5 }]);
  badInput([{ id: "bad", qty: 1 }]);
  badInput([{ id: A, qty: 75 }, { id: A, qty: 25 }]);
  const long = validateQuoteRequest([{ id: A, qty: 1 }], "a".repeat(41));
  assert.equal(long.ok, false);
  function badInput(items: unknown) { assert.equal(validateQuoteRequest(items, "").ok, false); }
});
test("duplicate rows aggregate like create_order, including case-insensitive UUIDs", () => {
  const r = validateQuoteRequest([{ id: A.toUpperCase(), qty: 2 }, { id: A, qty: 3 }], "");
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value.items, [{ id: A, qty: 5 }]);
});
test("server quote uses product prices, not browser amounts", () => {
  const q = good(calculateCheckoutQuote(basic()));
  assert.equal(q.subtotal_ore, 19900);
  assert.equal(q.shipping_ore, 4900);
  assert.equal(q.total_ore, 24800);
});
test("variant prices and labels are sourced from the database", () => {
  const q = good(calculateCheckoutQuote({ ...basic(), items: [{ id: V, qty: 2 }] }));
  assert.deepEqual(q.lines.map(l => [l.name, l.variant, l.unit_ore]), [["Stinger", "MEDIUM", 3500]]);
  assert.equal(q.total_ore, 11900);
});
test("inactive variants and direct purchases of variant products are blocked", () => {
  bad(calculateCheckoutQuote({ ...basic(), items: [{ id: B, qty: 1 }] }));
  bad(calculateCheckoutQuote({ ...basic(), items: [{ id: V, qty: 1 }], variants: [{ ...variant, active: false }] }));
  bad(calculateCheckoutQuote({ ...basic(), products: [{ ...product, active: false }, variantProduct] }));
  bad(calculateCheckoutQuote({ ...basic(), items: [{ id: "2c483a78-1f3b-4219-a5fa-91f73ac954c4", qty: 1 }] }));
});
test("product inventory availability is checked across variants", () => {
  const args = { ...basic(), items: [{ id: V, qty: 2 }, { id: A, qty: 1 }], inventory: [{ product_id: B, variant_id: null, quantity: 2, reserved: 1 }] };
  bad(calculateCheckoutQuote(args));
  good(calculateCheckoutQuote({ ...args, inventory: [{ product_id: B, variant_id: null, quantity: 3, reserved: 1 }] }));
});
test("tracked variants use their own balance while older variants share remaining stock", () => {
  const second = { ...variant, id: "a5eae973-a7dc-4b31-8caf-8ae95527e7c3", label: "LARGE" };
  const shared = { product_id: B, variant_id: null, quantity: 2, reserved: 1 };
  const own = { product_id: B, variant_id: V, quantity: 3, reserved: 1 };
  const args = {
    ...basic(), variants: [variant, second],
    items: [{ id: V, qty: 2 }, { id: second.id, qty: 1 }],
  };
  good(calculateCheckoutQuote({ ...args, inventory: [shared, own] }));
  bad(calculateCheckoutQuote({ ...args, inventory: [shared] }));
  bad(calculateCheckoutQuote({ ...args, inventory: [shared, { ...own, quantity: 2 }] }));
  bad(calculateCheckoutQuote({
    ...args, inventory: [{ ...shared, quantity: 20 }, { ...own, quantity: 1 }],
  }));
});
test("percentage discounts truncate fractional öre like PostgreSQL integer division", () => {
  const args = basic();
  const q = good(calculateCheckoutQuote({ ...args, items: [{ id: V, qty: 1 }], discountCode: "TEN", discount: { percent: 15, amount_ore: null, active: true, expires_at: null, max_uses: null, used: 0 } }));
  assert.equal(q.discount_ore, 525);
  assert.equal(q.total_ore, 3500 - 525 + 4900);
  const fractional = good(calculateCheckoutQuote({ ...args, products: [{ ...product, price_ore: 1001 }, variantProduct], discountCode: "TEN", discount: { percent: 15, amount_ore: null, active: true, expires_at: null, max_uses: null, used: 0 } }));
  assert.equal(fractional.discount_ore, 150);
});
test("fixed discount capped at subtotal and total must be positive", () => {
  const args = basic();
  const discount = { percent: null, amount_ore: 99999, active: true, expires_at: null, max_uses: null, used: 0 };
  const q = good(calculateCheckoutQuote({ ...args, discountCode: "FIXED", discount }));
  assert.equal(q.discount_ore, 19900);
  assert.equal(q.total_ore, 4900);
  bad(calculateCheckoutQuote({ ...args, discountCode: "FIXED", discount, shipping: { flat_ore: 0, free_over_ore: null } }));
});
test("discount changes whether free shipping threshold is reached", () => {
  const args = basic();
  const items = [{ id: A, qty: 3 }];
  assert.equal(good(calculateCheckoutQuote({ ...args, items })).shipping_ore, 0);
  const discount = { percent: 20, amount_ore: null, active: true, expires_at: null, max_uses: null, used: 0 };
  const q = good(calculateCheckoutQuote({ ...args, items, discountCode: "TWENTY", discount }));
  assert.equal(q.shipping_ore, 4900);
  assert.equal(q.total_ore, 59700 - 11940 + 4900);
});
test("expired and exhausted discounts fail closed", () => {
  const args = basic();
  const discount = { percent: 10, amount_ore: null, active: true, expires_at: "2026-11-19T00:00:00Z", max_uses: 1, used: 0 };
  bad(calculateCheckoutQuote({ ...args, discountCode: "BAD", discount }));
  bad(calculateCheckoutQuote({ ...args, discountCode: "BAD", discount: { ...discount, expires_at: null, used: 1 } }));
  bad(calculateCheckoutQuote({ ...args, discountCode: "BAD", discount: null }));
});
test("missing or invalid shipping and non-positive totals fail closed", () => {
  bad(calculateCheckoutQuote({ ...basic(), shipping: { flat_ore: -1, free_over_ore: null } }));
  bad(calculateCheckoutQuote({ ...basic(), shipping: { flat_ore: 100, free_over_ore: -5 } }));
});

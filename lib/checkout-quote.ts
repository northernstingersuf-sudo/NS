/** Pure checkout pricing. The database create_order_checked function remains final authority. */
export type BasketItem = { id: string; qty: number };
export type QuoteProduct = { id: string; name_sv: string; price_ore: number; in_stock: boolean; active: boolean };
export type QuoteVariant = { id: string; product_id: string; label: string; price_ore: number; in_stock: boolean; active: boolean };
export type QuoteInventory = { product_id: string; quantity: number; reserved: number };
export type QuoteDiscount = { percent: number | null; amount_ore: number | null; active: boolean; expires_at: string | null; max_uses: number | null; used: number };
export type QuoteShipping = { flat_ore: number; free_over_ore: number | null };
export type QuoteLine = { id: string; name: string; variant: string | null; unit_ore: number; qty: number };
export type CheckoutQuote =
  | { ok: true; lines: QuoteLine[]; subtotal_ore: number; discount_ore: number; shipping_ore: number; total_ore: number }
  | { ok: false; error: string };
export type QuoteRequest = { items: BasketItem[]; discountCode: string | null };
export type ValidQuoteRequest = { ok: true; value: QuoteRequest } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INT = 2147483647;
const fail = (error: string): CheckoutQuote => ({ ok: false, error });

/** Validate even for direct server-action calls; aggregate duplicate IDs like create_order. */
export function validateQuoteRequest(rawItems: unknown, rawDiscountCode: unknown): ValidQuoteRequest {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 50)
    return { ok: false, error: "Varukorgen är tom eller innehåller för många rader." };
  if (rawDiscountCode != null && typeof rawDiscountCode !== "string")
    return { ok: false, error: "Ogiltig rabattkod." };
  const discountCode = (rawDiscountCode ?? "").toString().trim();
  if (discountCode.length > 40) return { ok: false, error: "Rabattkoden är för lång." };

  const quantities = new Map<string, number>();
  for (const row of rawItems) {
    if (!row || typeof row !== "object") return { ok: false, error: "Ogiltig vara i varukorgen." };
    const item = row as Record<string, unknown>;
    if (typeof item.id !== "string" || !UUID.test(item.id) ||
        typeof item.qty !== "number" || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99)
      return { ok: false, error: "Ogiltigt antal eller produkt i varukorgen." };
    const id = item.id.toLowerCase();
    const totalQty = (quantities.get(id) ?? 0) + item.qty;
    if (totalQty > 99) return { ok: false, error: "För många exemplar av samma vara." };
    quantities.set(id, totalQty);
  }
  return { ok: true, value: { items: [...quantities].map(([id, qty]) => ({ id, qty })), discountCode: discountCode || null } };
}

export function calculateCheckoutQuote(args: {
  items: BasketItem[];
  products: QuoteProduct[];
  variants: QuoteVariant[];
  activeVariantProductIds: string[];
  inventory: QuoteInventory[];
  discountCode: string | null;
  discount: QuoteDiscount | null;
  shipping: QuoteShipping;
  now?: number;
}): CheckoutQuote {
  const { items, products, variants, activeVariantProductIds, inventory, discountCode, discount, shipping } = args;
  if (!Number.isInteger(shipping.flat_ore) || shipping.flat_ore < 0 ||
      (shipping.free_over_ore !== null && (!Number.isInteger(shipping.free_over_ore) || shipping.free_over_ore < 0)))
    return fail("Fraktpriset är inte korrekt konfigurerat.");
  const byProduct = new Map(products.map(p => [p.id, p]));
  const byVariant = new Map(variants.map(v => [v.id, v]));
  const activeVariants = new Set(activeVariantProductIds);
  const inventoryByProduct = new Map(inventory.map(s => [s.product_id, s]));
  const reservedByProduct = new Map<string, number>();
  const lines: QuoteLine[] = [];
  let subtotal = 0;
  for (const item of items) {
    const variant = byVariant.get(item.id);
    const product = byProduct.get(variant?.product_id ?? item.id);
    if (!product || !product.active) return fail("En vara i varukorgen är inte längre tillgänglig. Uppdatera varukorgen.");
    if (variant ? (!variant.active || !variant.in_stock) : (activeVariants.has(product.id) || !product.in_stock))
      return fail("En vara eller variant är slutsåld eller kan inte beställas. Uppdatera varukorgen.");
    const price = variant ? variant.price_ore : product.price_ore;
    if (!Number.isInteger(price) || price < 0 || !Number.isSafeInteger(price * item.qty) || price > MAX_INT)
      return fail("Kunde inte kontrollera produktpriset.");
    subtotal += price * item.qty;
    if (!Number.isSafeInteger(subtotal) || subtotal > MAX_INT) return fail("Orderbeloppet är för stort.");
    reservedByProduct.set(product.id, (reservedByProduct.get(product.id) ?? 0) + item.qty);
    lines.push({ id: item.id, name: product.name_sv, variant: variant?.label ?? null, unit_ore: price, qty: item.qty });
  }
  for (const [productId, qty] of reservedByProduct) {
    const stock = inventoryByProduct.get(productId);
    if (stock && (!Number.isInteger(stock.quantity) || !Number.isInteger(stock.reserved) ||
                  stock.quantity - stock.reserved < qty))
      return fail("Lagersaldot har ändrats. Uppdatera varukorgen och försök igen.");
  }

  let discountOre = 0;
  if (discountCode) {
    const now = args.now ?? Date.now();
    if (!discount || !discount.active || (discount.expires_at !== null && new Date(discount.expires_at).getTime() < now) ||
        (discount.max_uses !== null && discount.used >= discount.max_uses))
      return fail("Rabattkoden är ogiltig, har gått ut eller är slutanvänd.");
    if (discount.percent !== null) discountOre = Math.trunc(subtotal * discount.percent / 100);
    else if (discount.amount_ore !== null) discountOre = Math.min(discount.amount_ore, subtotal);
    if (!Number.isSafeInteger(discountOre) || discountOre < 0 || discountOre > subtotal)
      return fail("Rabattkoden har en ogiltig inställning.");
  }

  // create_order applies free-shipping thresholds AFTER discounts.
  const shippingOre = shipping.free_over_ore !== null && subtotal - discountOre >= shipping.free_over_ore ? 0 : shipping.flat_ore;
  const total = subtotal - discountOre + shippingOre;
  if (!Number.isSafeInteger(total) || total <= 0 || total > MAX_INT)
    return fail("Orderbeloppet är ogiltigt. Kontakta kundservice.");
  return { ok: true, lines, subtotal_ore: subtotal, discount_ore: discountOre, shipping_ore: shippingOre, total_ore: total };
}

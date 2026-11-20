"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { notifyOrder } from "@/lib/notify";
import { isEmailConfigured, notifyEmail } from "@/lib/notify-email";
import { validateCheckout, describeOrderError } from "@/lib/checkout";
import { normalizeSwishNumber } from "@/lib/swish";
import { rateLimit } from "@/lib/rate-limit";
import { calculateCheckoutQuote, validateQuoteRequest, type CheckoutQuote } from "@/lib/checkout-quote";
import { businessDetailsComplete } from "@/lib/business";

export type CheckoutConfig = { open: true; shipping: { flat_ore: number; free_over_ore: number | null } } | { open: false; reason: string };

/** Är kassan redo? Kräver service role, giltigt Swish-nummer och konfigurerad frakt. Visar aldrig själva värdena. */
export async function getCheckoutConfig(): Promise<CheckoutConfig> {
  if (!hasServiceRole()) return { open: false, reason: "Kassan är inte konfigurerad ännu." };
  if (!businessDetailsComplete || !process.env.PUBLIC_DELIVERY_ESTIMATE?.trim()) return { open: false, reason: "Fyll i säljarens företagsuppgifter och en verklig leveranstidsuppskattning innan kassan öppnas." };
  if (!isEmailConfigured()) return { open: false, reason: "E-posttjänsten måste konfigureras och testas innan kassan öppnas, så att obligatoriska mottagningsbevis kan skickas." };
  if (!normalizeSwishNumber(process.env.SWISH_NUMBER)) return { open: false, reason: "Betalning är inte konfigurerad ännu." };
  const sb = createAdminClient();
  const { data, error } = await sb.from("shop_settings").select("value").eq("key", "shipping").maybeSingle();
  const v = data?.value as { flat_ore?: number; free_over_ore?: number | null } | undefined;
  if (error || !v || !Number.isInteger(v.flat_ore)) return { open: false, reason: "Fraktpris är inte angivet ännu." };
  return { open: true, shipping: { flat_ore: v.flat_ore as number, free_over_ore: Number.isInteger(v.free_over_ore) ? (v.free_over_ore as number) : null } };
}

/** Fetch pricing from the server only. Never accept prices, discounts or totals from the browser. */
export async function quoteCheckout(rawItems: unknown, rawDiscountCode: unknown): Promise<CheckoutQuote> {
  const parsed = validateQuoteRequest(rawItems, rawDiscountCode);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    const cfg = await getCheckoutConfig();
    if (!cfg.open) return { ok: false, error: cfg.reason };
    const { items, discountCode } = parsed.value;
    const sb = createAdminClient(); // service role needed for inventory and discount availability

    const ids = items.map(i => i.id);
    const { data: variants, error: variantError } = await sb.from("product_variants")
      .select("id,product_id,label,price_ore,in_stock,active").in("id", ids);
    if (variantError) throw variantError;
    const productIds = [...new Set([...ids, ...(variants ?? []).map(v => v.product_id)])];
    const [productsResult, activeResult, inventoryResult, discountResult] = await Promise.all([
      sb.from("products").select("id,name_sv,price_ore,in_stock,active").in("id", productIds),
      sb.from("product_variants").select("product_id").in("product_id", productIds).eq("active", true),
      sb.from("inventory").select("product_id,quantity,reserved").in("product_id", productIds),
      discountCode
        ? sb.from("discounts").select("code,percent,amount_ore,active,expires_at,max_uses,used")
            .ilike("code", discountCode).limit(50)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (productsResult.error || activeResult.error || inventoryResult.error || discountResult.error)
      throw productsResult.error ?? activeResult.error ?? inventoryResult.error ?? discountResult.error;
    // Match exactly, ignoring case. ILIKE is only a database pre-filter and can match SQL wildcards.
    const discount = (discountResult.data ?? []).find(d => d.code.toLowerCase() === (discountCode ?? "").toLowerCase()) ?? null;
    return calculateCheckoutQuote({
      items, products: productsResult.data ?? [], variants: variants ?? [],
      activeVariantProductIds: (activeResult.data ?? []).map(v => v.product_id),
      inventory: inventoryResult.data ?? [], discountCode, discount,
      shipping: cfg.shipping,
    });
  } catch (error) {
    console.error("[checkout] quote failed:", error instanceof Error ? error.name : "unknown");
    return { ok: false, error: "Kunde inte kontrollera aktuella priser eller lager. Försök igen." };
  }
}

export type PlaceOrderResult = { ok: true; token: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function placeOrder(raw: unknown, expectedTotalOre: unknown): Promise<PlaceOrderResult> {
  // Honeypot: riktiga användare fyller aldrig i fältet.
  if (raw && typeof raw === "object" && String((raw as { website?: unknown }).website ?? "").trim()) return { ok: false, error: "Beställningen kunde inte läggas." };

  if (!Number.isSafeInteger(expectedTotalOre) || (expectedTotalOre as number) <= 0)
    return { ok: false, error: "Orderbeloppet måste kontrolleras igen innan du beställer." };

  const parsed = validateCheckout(raw);
  if (!parsed.ok) return { ok: false, error: parsed.errors.form ?? "Kontrollera uppgifterna i formuläret.", fieldErrors: parsed.errors };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!rateLimit(`order:${ip}`, 8, 10 * 60_000)) return { ok: false, error: "För många försök. Vänta en stund och försök igen." };

  const cfg = await getCheckoutConfig();
  if (!cfg.open) return { ok: false, error: `${cfg.reason} Försök igen senare.` };

  // Inloggad kund kopplas till kontot; gäster fortsätter utan konto.
  let userId: string | null = null;
  try { const sb = await createClient(); const { data: { user } } = await sb.auth.getUser(); userId = user?.id ?? null; } catch {}

  const v = parsed.value;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("create_order_checked", {
    p_idempotency_key: v.idempotencyKey,
    p_user_id: userId,
    p_email: v.email,
    p_locale: "sv",
    p_shipping_address: v.address,
    p_items: v.items,
    p_discount_code: v.discountCode,
    p_expected_total_ore: expectedTotalOre as number,
  });
  if (error || !data) {
    const e = describeOrderError(error?.message, error?.details);
    if (error?.message?.includes("checkout_price_changed")) return { ok: false, error: "Priset eller frakten har ändrats. Kontrollera den uppdaterade summan och försök igen." };
    if (e.code === "unknown") console.error(`[checkout] create_order misslyckades (${error?.code ?? "?"}): ${error?.message ?? "inget svar"}`);
    return { ok: false, error: e.message };
  }

  const result = data as { order_id: string; guest_token: string; created: boolean };
  // Discord: bara för nyskapad order (replay skickar inget). Fel här påverkar aldrig ordern.
  // Discord och kundmejl skickas parallellt. Fel i någon av dem påverkar aldrig ordern.
  if (result.created) await Promise.all([notifyOrder(result.order_id, "order_created"), notifyEmail(result.order_id, "order_confirmation")]);
  return { ok: true, token: result.guest_token };
}

"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { notifyOrder } from "@/lib/notify";
import { validateCheckout, describeOrderError } from "@/lib/checkout";
import { normalizeSwishNumber } from "@/lib/swish";
import { rateLimit } from "@/lib/rate-limit";

export type CheckoutConfig = { open: true; shipping: { flat_ore: number; free_over_ore: number | null } } | { open: false; reason: string };

/** Är kassan redo? Kräver service role, giltigt Swish-nummer och konfigurerad frakt. Visar aldrig själva värdena. */
export async function getCheckoutConfig(): Promise<CheckoutConfig> {
  if (!hasServiceRole()) return { open: false, reason: "Kassan är inte konfigurerad ännu." };
  if (!normalizeSwishNumber(process.env.SWISH_NUMBER)) return { open: false, reason: "Betalning är inte konfigurerad ännu." };
  const sb = createAdminClient();
  const { data, error } = await sb.from("shop_settings").select("value").eq("key", "shipping").maybeSingle();
  const v = data?.value as { flat_ore?: number; free_over_ore?: number | null } | undefined;
  if (error || !v || !Number.isInteger(v.flat_ore)) return { open: false, reason: "Fraktpris är inte angivet ännu." };
  return { open: true, shipping: { flat_ore: v.flat_ore as number, free_over_ore: Number.isInteger(v.free_over_ore) ? (v.free_over_ore as number) : null } };
}

export type QuoteLine = { id: string; name: string; variant: string | null; unit_ore: number; qty: number; problem: string | null };

/** Aktuella priser och tillgänglighet för varukorgen (endast visning). Den bindande summan räknas i create_order. */
export async function quoteCart(items: { id: string; qty: number }[]): Promise<QuoteLine[]> {
  const ids = [...new Set(items.map((i) => i.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 50);
  if (!ids.length) return [];
  const sb = createPublicClient();
  const [vars, prods] = await Promise.all([
    sb.from("product_variants").select("id,label,price_ore,in_stock,active,products!inner(name_sv,active)").in("id", ids),
    sb.from("products").select("id,name_sv,price_ore,in_stock,active,product_variants(id)").in("id", ids),
  ]);
  const byVar = new Map((vars.data ?? []).map((v: any) => [v.id, v]));
  const byProd = new Map((prods.data ?? []).map((p: any) => [p.id, p]));
  return items.map((it) => {
    const v: any = byVar.get(it.id);
    if (v) return { id: it.id, name: v.products.name_sv, variant: v.label, unit_ore: v.price_ore, qty: it.qty, problem: !v.active || !v.products.active ? "Inte längre tillgänglig" : !v.in_stock ? "Slut i lager" : null };
    const p: any = byProd.get(it.id);
    if (p && !(p.product_variants ?? []).length) return { id: it.id, name: p.name_sv, variant: null, unit_ore: p.price_ore, qty: it.qty, problem: !p.active ? "Inte längre tillgänglig" : !p.in_stock ? "Slut i lager" : null };
    return { id: it.id, name: "Okänd vara", variant: null, unit_ore: 0, qty: it.qty, problem: "Inte längre tillgänglig" };
  });
}

export type PlaceOrderResult = { ok: true; token: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function placeOrder(raw: unknown): Promise<PlaceOrderResult> {
  // Honeypot: riktiga användare fyller aldrig i fältet.
  if (raw && typeof raw === "object" && String((raw as { website?: unknown }).website ?? "").trim()) return { ok: false, error: "Beställningen kunde inte läggas." };

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
  const { data, error } = await admin.rpc("create_order", {
    p_idempotency_key: v.idempotencyKey,
    p_user_id: userId,
    p_email: v.email,
    p_locale: "sv",
    p_shipping_address: v.address,
    p_items: v.items,
    p_discount_code: v.discountCode,
  });
  if (error || !data) {
    const e = describeOrderError(error?.message, error?.details);
    if (e.code === "unknown") console.error(`[checkout] create_order misslyckades (${error?.code ?? "?"}): ${error?.message ?? "inget svar"}`);
    return { ok: false, error: e.message };
  }

  const result = data as { order_id: string; guest_token: string; created: boolean };
  // Discord: bara för nyskapad order (replay skickar inget). Fel här påverkar aldrig ordern.
  if (result.created) await notifyOrder(result.order_id, "order_created");
  return { ok: true, token: result.guest_token };
}

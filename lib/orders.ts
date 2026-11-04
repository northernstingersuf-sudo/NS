import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GuestOrder = {
  id: string;
  order_number: string | null;
  status: "pending" | "paid" | "packed" | "shipped" | "delivered" | "cancelled" | "refunded";
  email: string;
  subtotal_ore: number;
  discount_ore: number;
  shipping_ore: number;
  total_ore: number;
  tracking_number: string | null;
  created_at: string;
  shipping_address: { name?: string; line1?: string; line2?: string | null; postal_code?: string; city?: string };
  order_items: { name: string; variant: string | null; quantity: number; unit_price_ore: number }[];
  payments: { status: "initiated" | "paid" | "failed" | "cancelled" | "refunded"; reported_at: string | null; reference: string | null }[];
};

/** Hämtar en order via den hemliga gästtoken. Token är 122 bitar slumpdata, aldrig ordernummer eller id. */
export async function getOrderByToken(token: string): Promise<GuestOrder | null> {
  if (!UUID.test(token)) return null;
  const sb = createAdminClient();
  const { data, error } = await sb
    .from("orders")
    .select("id,order_number,status,email,subtotal_ore,discount_ore,shipping_ore,total_ore,tracking_number,created_at,shipping_address,order_items(name,variant,quantity,unit_price_ore),payments(status,reported_at,reference)")
    .eq("guest_token", token)
    .maybeSingle();
  if (error) { console.error(`[orders] tokenuppslag misslyckades (${error.code})`); return null; }
  return (data as unknown as GuestOrder) ?? null;
}

/** Kundens visade status. "Betald" visas ENDAST när admin verifierat betalningen (payments.status = 'paid'). */
export type CustomerStatus = "awaiting_payment" | "reported" | "paid" | "packed" | "shipped" | "delivered" | "cancelled" | "refunded";
export function customerStatus(o: Pick<GuestOrder, "status" | "payments">): CustomerStatus {
  const p = o.payments[0];
  if (o.status === "cancelled") return "cancelled";
  if (o.status === "refunded") return "refunded";
  if (o.status === "pending") return p?.reported_at ? "reported" : "awaiting_payment";
  if (p?.status !== "paid" && p?.status !== "refunded") return p?.reported_at ? "reported" : "awaiting_payment"; // skyddsnät: aldrig "betald" utan verifierad betalning
  return o.status;
}

"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { parseSekToOre } from "@/lib/money";
import { notifyOrder } from "@/lib/notify";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const STATUSES = ["packed", "shipped", "delivered", "cancelled"] as const;

const MESSAGES: Record<string, string> = {
  amount_mismatch: "Beloppet stämmer inte med orderns totalsumma. Betalningen markerades inte som betald.",
  payment_not_pending: "Betalningen är redan hanterad eller ordern är inte längre väntande.",
  invalid_transition: "Den statusändringen är inte tillåten från nuvarande status.",
  invalid_refund_amount: "Ogiltigt återbetalningsbelopp (för stort eller noll).",
  refund_requires_verified_payment: "Återbetalning kan bara registreras för en verifierad betalning.",
  invalid_tracking: "Spårningsnumret är för långt (högst 80 tecken).",
};
const explain = (msg: string) => MESSAGES[Object.keys(MESSAGES).find((k) => msg.includes(k)) ?? ""] ?? "Åtgärden misslyckades. Kontrollera behörighet och migrationer.";

function back(id: string, kind: "ok" | "fel", text: string): never {
  redirect(`/admin/ordrar/${id}?${kind}=${encodeURIComponent(text)}`);
}

/** Verifiera Swish-betalning manuellt. Admin ska ha kontrollerat Swish-appen/bankkontot och anger det mottagna beloppet. */
export async function verifyPayment(formData: FormData) {
  const { sb } = await requireAdmin();
  const id = val(formData, "id");
  if (!UUID.test(id)) redirect("/admin/ordrar");
  if (val(formData, "confirm") !== "on") back(id, "fel", "Bekräfta att du kontrollerat att pengarna kommit in.");
  const ore = parseSekToOre(val(formData, "received"));
  if (ore === null || ore <= 0) back(id, "fel", "Ange det mottagna beloppet i kronor, t.ex. 318 eller 318,50.");
  const { error } = await sb.rpc("admin_verify_payment", { p_order_id: id, p_received_ore: ore });
  if (error) back(id, "fel", explain(error.message));
  // Notis efter lyckad verifiering. Fel här påverkar aldrig verifieringen; status syns på orderns sida.
  const outcome = await notifyOrder(id, "payment_verified");
  back(id, "ok", outcome === "failed" ? "Betalningen är verifierad. Discord-notisen misslyckades, se status nedan." : "Betalningen är verifierad och ordern markerad som betald.");
}

export async function updateOrder(formData: FormData) {
  const { sb } = await requireAdmin();
  const id = val(formData, "id");
  if (!UUID.test(id)) redirect("/admin/ordrar");
  const status = val(formData, "status");
  if (status && !(STATUSES as readonly string[]).includes(status)) back(id, "fel", "Ogiltig status.");
  const { error } = await sb.rpc("admin_update_order", { p_order_id: id, p_status: status || null, p_tracking: val(formData, "tracking") || null });
  if (error) back(id, "fel", explain(error.message));
  if (status === "shipped") {
    const outcome = await notifyOrder(id, "order_shipped");
    if (outcome === "failed") back(id, "ok", "Ordern är markerad som skickad. Discord-notisen misslyckades, se status nedan.");
  }
  back(id, "ok", "Ordern är uppdaterad.");
}

/** Registrerar ENDAST en administrativ återbetalningsstatus. Pengarna återbetalas manuellt i Swish/bank. */
export async function registerRefund(formData: FormData) {
  const { sb } = await requireAdmin();
  const id = val(formData, "id");
  if (!UUID.test(id)) redirect("/admin/ordrar");
  if (val(formData, "confirm") !== "on") back(id, "fel", "Bekräfta att återbetalningen är gjord (eller görs) manuellt.");
  const ore = parseSekToOre(val(formData, "amount"));
  if (ore === null || ore <= 0) back(id, "fel", "Ange ett giltigt belopp.");
  const { error } = await sb.rpc("admin_register_refund", { p_order_id: id, p_amount_ore: ore, p_note: val(formData, "note") || null });
  if (error) back(id, "fel", explain(error.message));
  back(id, "ok", "Återbetalningen är registrerad som administrativ status. Ingen pengaöverföring har gjorts av systemet.");
}

/** Försök skicka en misslyckad Discord-notis igen. Redan skickade notiser skickas inte om. */
export async function retryNotification(formData: FormData) {
  const { sb } = await requireAdmin();
  const id = val(formData, "id");
  const kind = val(formData, "kind");
  if (!UUID.test(id) || (kind !== "order_created" && kind !== "payment_reported" && kind !== "payment_verified" && kind !== "order_shipped")) redirect("/admin/ordrar");
  const { data } = await sb.from("orders").select("id").eq("id", id).maybeSingle(); // bekräftar adminåtkomst till ordern
  if (!data) redirect("/admin/ordrar");
  const outcome = await notifyOrder(id, kind);
  back(id, outcome === "sent" ? "ok" : "fel", outcome === "sent" ? "Discord-notisen skickades." : outcome === "skipped" ? "Notisen är redan skickad eller pågår." : "Discord-notisen misslyckades igen. Se status nedan.");
}

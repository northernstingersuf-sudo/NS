"use server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { parseSekToOre } from "@/lib/money";

export async function saveShipping(formData: FormData) {
  const { sb, user } = await requireAdmin();
  const flat = parseSekToOre(String(formData.get("flat") ?? ""));
  const freeRaw = String(formData.get("free_over") ?? "").trim();
  const free = freeRaw ? parseSekToOre(freeRaw) : null;
  if (flat === null || (freeRaw && free === null)) redirect("/admin/installningar?fel=" + encodeURIComponent("Ange giltiga belopp i kronor."));
  const { error } = await sb.from("shop_settings").upsert({ key: "shipping", value: { flat_ore: flat, free_over_ore: free }, updated_at: new Date().toISOString() });
  if (error) redirect("/admin/installningar?fel=" + encodeURIComponent("Kunde inte spara. Är migration 0006 körd?"));
  await sb.from("audit_logs").insert({ actor: user.id, action: "settings.shipping_updated", target: "shipping", meta: { flat_ore: flat, free_over_ore: free } });
  redirect("/admin/installningar?ok=1");
}

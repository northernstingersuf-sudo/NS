"use server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

export async function adjustStock(formData: FormData) {
  const { sb } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const delta = Number(String(formData.get("delta") ?? "").trim());
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000 || reason.length < 3)
    redirect("/admin/lager?fel=" + encodeURIComponent("Ange ett heltal (ej 0) och en orsak på minst 3 tecken."));
  const { error } = await sb.rpc("admin_adjust_stock", { p_product_id: id, p_delta: delta, p_reason: reason.slice(0, 300) });
  if (error) redirect("/admin/lager?fel=" + encodeURIComponent(error.message.includes("stock_below_reserved") ? "Saldot kan inte bli lägre än det som redan är reserverat i order." : "Kunde inte justera lagret."));
  redirect("/admin/lager?ok=1");
}

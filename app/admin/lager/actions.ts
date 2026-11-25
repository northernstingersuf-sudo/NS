"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

export async function adjustStock(formData: FormData) {
  const { sb } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  const rawDelta = String(formData.get("delta") ?? "").trim();
  const delta = Number(rawDelta);
  const reason = String(formData.get("reason") ?? "").trim();
  const transfer = formData.get("operation") === "transfer";
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  if (!uuid.test(id) || (variantId && !uuid.test(variantId)) || !rawDelta || !Number.isInteger(delta) ||
      Math.abs(delta) > 100000 || (!variantId && delta === 0) || (transfer && (!variantId || delta < 0)) ||
      reason.length < 3 || reason.length > 300) {
    redirect("/admin/lager?fel=" + encodeURIComponent("Ange ett giltigt antal och en orsak på 3–300 tecken."));
  }
  const { error } = variantId
    ? await sb.rpc("admin_adjust_variant_stock", { p_variant_id: variantId, p_delta: delta, p_reason: reason, p_transfer: transfer })
    : await sb.rpc("admin_adjust_stock", { p_product_id: id, p_delta: delta, p_reason: reason });
  if (error) {
    let message = "Kunde inte justera lagret.";
    if (error.message.includes("stock_below_reserved")) message = "Saldot kan inte bli lägre än det som redan är reserverat.";
    if (error.message.includes("insufficient_shared_stock")) message = "Det finns inte så många tillgängliga enheter i det gemensamma saldot.";
    redirect("/admin/lager?fel=" + encodeURIComponent(message));
  }
  revalidatePath("/");
  revalidatePath("/produkter");
  revalidatePath("/produkter/[slug]", "page");
  redirect("/admin/lager?ok=1");
}

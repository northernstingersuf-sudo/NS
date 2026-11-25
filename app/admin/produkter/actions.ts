"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

const value = (f: FormData, key: string) => String(f.get(key) ?? "").trim();

function parseMoney(raw: string, required: boolean): number | null {
  if (!raw && !required) return null;
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("Ange ett giltigt pris med högst två decimaler.");
  const ore = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(ore) || ore < 0) throw new Error("Priset är ogiltigt.");
  return ore;
}

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function parseVariants(formData: FormData) {
  const keys = formData.getAll("variant_row");
  if (keys.length > 100 || new Set(keys).size !== keys.length) throw new Error("Ogiltig variantlista.");
  return keys.map((key, index) => {
    if (typeof key !== "string" || (!UUID.test(key) && !/^new-\d+$/.test(key))) throw new Error("Ogiltig variant.");
    const label = value(formData, key + "_label");
    const price = parseMoney(value(formData, key + "_price"), true);
    if (!label || price === null) throw new Error("Ange namn och pris för varje variant.");
    return {
      id: UUID.test(key) ? key : null,
      label: label.slice(0, 80),
      price_ore: price,
      sku: value(formData, key + "_sku").slice(0, 80) || null,
      active: formData.has(key + "_active"),
      in_stock: formData.has(key + "_in_stock"),
      position: index + 1,
    };
  });
}

export async function saveProduct(formData: FormData) {
  const { sb } = await requireAdmin();
  const id = value(formData, "id");
  const editPath = UUID.test(id) ? "/admin/produkter/" + id : "/admin/produkter/ny";
  let savedId: string;
  try {
    if (id && !UUID.test(id)) throw new Error("Ogiltigt produkt-ID.");
    const nameSv = value(formData, "name_sv");
    const slug = value(formData, "slug").toLowerCase();
    if (!nameSv || !slug) throw new Error("Svenskt produktnamn och URL-slug krävs.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("URL-slug får bara innehålla små bokstäver, siffror och bindestreck.");

    const categoryId = value(formData, "category_id");
    const variants = parseVariants(formData);
    const activeVariants = variants.filter(variant => variant.active);
    const enteredBasePrice = parseMoney(value(formData, "price"), activeVariants.length === 0);
    const comparePrice = parseMoney(value(formData, "compare_price"), false);
    const basePrice = enteredBasePrice ?? Math.min(...activeVariants.map((v) => v.price_ore));
    if (comparePrice !== null && comparePrice <= basePrice) throw new Error("Jämförelsepriset måste vara högre än ordinarie pris.");

    const product = {
      id: id || null,
      slug,
      sku: value(formData, "sku") || null,
      category_id: categoryId || null,
      name_sv: nameSv.slice(0, 160),
      name_en: value(formData, "name_en").slice(0, 160) || null,
      description_sv: value(formData, "description_sv").slice(0, 5000) || null,
      description_en: value(formData, "description_en").slice(0, 5000) || null,
      price_ore: basePrice,
      compare_price_ore: comparePrice,
      in_stock: formData.has("in_stock"),
      active: formData.has("active"),
      seo_title_sv: value(formData, "seo_title_sv").slice(0, 180) || null,
      seo_desc_sv: value(formData, "seo_desc_sv").slice(0, 300) || null,
      seo_title_en: value(formData, "seo_title_en").slice(0, 180) || null,
      seo_desc_en: value(formData, "seo_desc_en").slice(0, 300) || null,
    };

    const { data, error } = await sb.rpc("admin_save_product", {
      p_product: product,
      p_variants: variants,
    });
    if (error || typeof data !== "string") throw new Error(error?.message ?? "Kunde inte spara produkten.");
    savedId = data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte spara produkten.";
    redirect(editPath + "?fel=" + encodeURIComponent(message.slice(0, 180)));
  }
  revalidatePath("/");
  revalidatePath("/produkter");
  revalidatePath("/produkter/[slug]", "page");
  redirect("/admin/produkter/" + savedId + "?sparad=1");
}

export async function setProductActive(formData: FormData) {
  const { sb } = await requireAdmin();
  const id = value(formData, "id");
  const active = value(formData, "active") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/admin/produkter?fel=Ogiltigt produkt-ID");
  const { data: product, error } = await sb.from("products").update({ active }).eq("id", id).select("slug").maybeSingle();
  if (error || !product) redirect(`/admin/produkter?fel=${encodeURIComponent("Kunde inte ändra publiceringsstatus.")}`);
  const { data: { user } } = await sb.auth.getUser();
  await sb.from("audit_logs").insert({ actor: user?.id ?? null, action: active ? "product.published" : "product.unpublished", target: id, meta: { slug: product.slug } });
  redirect("/admin/produkter?uppdaterad=1");
}

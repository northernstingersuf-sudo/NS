"use server";

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

function parseVariants(raw: string) {
  return raw.split("\n").map((line, index) => line.trim()).filter(Boolean).map((line, index) => {
    const [labelRaw, priceRaw, skuRaw = ""] = line.split("|").map((part) => part.trim());
    if (!labelRaw || !priceRaw) throw new Error(`Variant på rad ${index + 1} måste ha formatet NAMN | PRIS | SKU.`);
    const price = parseMoney(priceRaw, true);
    if (price === null) throw new Error(`Variant på rad ${index + 1} saknar pris.`);
    return {
      label: labelRaw.slice(0, 80),
      price_ore: price,
      sku: skuRaw.slice(0, 80) || null,
      position: index + 1,
    };
  });
}

export async function saveProduct(formData: FormData) {
  const { sb } = await requireAdmin();
  try {
    const nameSv = value(formData, "name_sv");
    const slug = value(formData, "slug").toLowerCase();
    if (!nameSv || !slug) throw new Error("Svenskt produktnamn och URL-slug krävs.");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("URL-slug får bara innehålla små bokstäver, siffror och bindestreck.");

    const categoryId = value(formData, "category_id");
    const variants = parseVariants(value(formData, "variant_lines"));
    const enteredBasePrice = parseMoney(value(formData, "price"), variants.length === 0);
    const comparePrice = parseMoney(value(formData, "compare_price"), false);
    const basePrice = enteredBasePrice ?? Math.min(...variants.map((v) => v.price_ore));
    if (comparePrice !== null && comparePrice <= basePrice) throw new Error("Jämförelsepriset måste vara högre än ordinarie pris.");

    const product = {
      id: value(formData, "id") || null,
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

    const { error } = await sb.rpc("admin_save_product", {
      p_product: product,
      p_variants: variants,
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kunde inte spara produkten.";
    redirect(`/admin/produkter?fel=${encodeURIComponent(message.slice(0, 180))}`);
  }
  redirect("/admin/produkter?sparad=1");
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

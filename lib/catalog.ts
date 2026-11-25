export type Variant = { id: string; label: string; price_ore: number; compare_price_ore: number | null; in_stock: boolean; position: number; active: boolean };
export type ProductImage = { id: string; variant_id: string | null; url: string; alt_sv: string | null; alt_en: string | null; position: number | null };
export type Product = {
  id: string; slug: string; name_sv: string; name_en: string | null; description_sv: string | null; description_en: string | null;
  price_ore: number; compare_price_ore: number | null; in_stock: boolean;
  categories: { slug: string; name_sv: string } | null;
  product_images: ProductImage[];
  product_variants: Variant[];
};
export type Category = { slug: string; name_sv: string };

export const sek = (ore: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(ore / 100);

export const variantsOf = (p: Product) => [...(p.product_variants ?? [])].filter((v) => v.active).sort((a, b) => a.position - b.position);
export const fromPrice = (p: Product) => { const v = variantsOf(p); return v.length ? Math.min(...v.map((x) => x.price_ore)) : p.price_ore; };
export const toPrice = (p: Product) => { const v = variantsOf(p); return v.length ? Math.max(...v.map((x) => x.price_ore)) : p.price_ore; };
export const inStock = (p: Product) => { const v = variantsOf(p); return v.length ? v.some((x) => x.in_stock) : p.in_stock; };

export function productImages(p: Product) {
  const variantIds = new Set(variantsOf(p).map(variant => variant.id));
  return p.product_images.filter(image => !image.variant_id || variantIds.has(image.variant_id)).sort(
    (a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.id.localeCompare(b.id)
  );
}

export function productCover(p: Product) {
  const images = productImages(p);
  const variants = variantsOf(p);
  const preferred = variants.find(variant => variant.in_stock) ?? variants[0];
  return images.find(image => !image.variant_id) ?? images.find(image => image.variant_id === preferred?.id) ?? images[0];
}

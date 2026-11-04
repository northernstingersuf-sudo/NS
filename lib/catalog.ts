export type Variant = { id: string; label: string; price_ore: number; compare_price_ore: number | null; in_stock: boolean; position: number; active: boolean };
export type Product = {
  id: string; slug: string; name_sv: string; name_en: string | null; description_sv: string | null; description_en: string | null;
  price_ore: number; compare_price_ore: number | null; in_stock: boolean;
  categories: { slug: string; name_sv: string } | null;
  product_images: { id: string; variant_id: string | null; url: string; alt_sv: string | null; alt_en: string | null; position: number }[];
  product_variants: Variant[];
};
export type Category = { slug: string; name_sv: string };

export const sek = (ore: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(ore / 100);

export const variantsOf = (p: Product) => [...(p.product_variants ?? [])].filter((v) => v.active).sort((a, b) => a.position - b.position);
export const fromPrice = (p: Product) => { const v = variantsOf(p); return v.length ? Math.min(...v.map((x) => x.price_ore)) : p.price_ore; };
export const toPrice = (p: Product) => { const v = variantsOf(p); return v.length ? Math.max(...v.map((x) => x.price_ore)) : p.price_ore; };
export const inStock = (p: Product) => { const v = variantsOf(p); return v.length ? v.some((x) => x.in_stock) : p.in_stock; };

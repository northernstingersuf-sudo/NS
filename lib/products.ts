import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { fromPrice, type Category, type Product, inStock } from "./catalog";
import { stockByScope } from "./stock";
export * from "./catalog";

const SELECT = "id,slug,name_sv,name_en,description_sv,description_en,price_ore,compare_price_ore,in_stock,categories(slug,name_sv),product_images(id,variant_id,url,alt_sv,alt_en,position),product_variants(id,label,price_ore,compare_price_ore,in_stock,position,active)";

async function withStock(products: Product[]): Promise<Product[]> {
  if (!products.length || !hasServiceRole()) return products;
  const { data, error } = await createAdminClient().from("stock_balances")
    .select("product_id,variant_id,quantity,reserved").in("product_id", products.map(p => p.id));
  if (error) {
    console.error(`[catalog] Stock query failed (${error.code}).`);
    return products;
  }
  const balances = stockByScope(data);
  function available(productId: string, variantId?: string) {
    const balance = (variantId && balances.variants.get(variantId)) || balances.products.get(productId);
    return !balance || balance.quantity > balance.reserved;
  }
  return products.map(p => ({
    ...p,
    in_stock: p.in_stock && available(p.id),
    product_variants: (p.product_variants ?? []).map(v => ({
      ...v,
      in_stock: v.in_stock && available(p.id, v.id),
    })),
  }));
}

export type ProductQuery = { category?: string; limit?: number; stock?: boolean; minKr?: number; maxKr?: number; sort?: string };

export async function getProducts(o: ProductQuery = {}): Promise<Product[]> {
  const sb = createPublicClient();
  let q = sb.from("products").select(o.category ? SELECT.replace("categories(", "categories!inner(") : SELECT)
    .eq("active", true).order("created_at", { ascending: false });
  if (o.category) q = q.eq("categories.slug", o.category);
  const { data, error } = await q;
  if (error) { console.error(`[catalog] Product query failed (${error.code}): ${error.message}. Check migrations 0003–0005 and the PostgREST schema cache.`); return []; }
  let list = await withStock((data as unknown as Product[]) ?? []);
  if (o.stock) list = list.filter(inStock);
  if (o.minKr !== undefined) list = list.filter((p) => fromPrice(p) >= o.minKr! * 100);
  if (o.maxKr !== undefined) list = list.filter((p) => fromPrice(p) <= o.maxKr! * 100);
  if (o.sort === "pris-asc") list.sort((a, b) => fromPrice(a) - fromPrice(b));
  if (o.sort === "pris-desc") list.sort((a, b) => fromPrice(b) - fromPrice(a));
  if (o.sort === "namn") list.sort((a, b) => a.name_sv.localeCompare(b.name_sv, "sv"));
  return o.limit ? list.slice(0, o.limit) : list;
}

export const getProduct = cache(async (slug: string): Promise<Product | null> => {
  const sb = createPublicClient();
  const { data, error } = await sb.from("products").select(SELECT).eq("slug", slug).eq("active", true).maybeSingle();
  if (error) console.error(`[catalog] Product detail query failed (${error.code}): ${error.message}. Check migrations 0003–0005 and the PostgREST schema cache.`);
  if (!data) return null;
  const [product] = await withStock([data as unknown as Product]);
  return product;
});

export async function getCategories(): Promise<Category[]> {
  const sb = createPublicClient();
  const { data, error } = await sb.from("categories").select("slug,name_sv").eq("active", true).order("position");
  if (error) console.error(`[catalog] Category query failed (${error.code}): ${error.message}`);
  return data ?? [];
}

export async function searchProducts(term: string): Promise<Product[]> {
  const q = term.replace(/[%,()*\\]/g, " ").trim().slice(0, 60);
  if (!q) return [];
  const sb = createPublicClient();
  const { data } = await sb.from("products").select(SELECT).eq("active", true).ilike("name_sv", `%${q}%`).limit(40);
  return withStock((data as unknown as Product[]) ?? []);
}

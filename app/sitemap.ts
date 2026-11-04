import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/products";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://northernstingers.se";
  const pages = ["", "/produkter", "/om-oss", "/kontakt", "/frakt-och-leverans", "/retur-och-reklamation", "/kopvillkor", "/integritetspolicy"];
  const products = await getProducts();
  return [...pages.map((p) => ({ url: base + p })), ...products.map((p) => ({ url: `${base}/produkter/${p.slug}` }))];
}

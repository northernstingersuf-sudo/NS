import type { MetadataRoute } from "next";
import { getProducts } from "@/lib/products";
import { SITE_URL } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;
  const pages = ["", "/produkter", "/om-oss", "/kontakt", "/frakt-och-leverans", "/retur-och-reklamation", "/kopvillkor", "/integritetspolicy", "/cookies"];
  const products = await getProducts();
  return [...pages.map((p) => ({ url: base + p })), ...products.map((p) => ({ url: `${base}/produkter/${p.slug}` }))];
}

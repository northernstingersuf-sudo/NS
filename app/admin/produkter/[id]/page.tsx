import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import ProductForm from "../ProduktForm";

export const metadata = { title: "Redigera produkt – Admin", robots: { index: false, follow: false } };

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { sb } = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: product }, { data: categories }, { data: variants }] = await Promise.all([
    sb.from("products").select("*").eq("id", id).maybeSingle(),
    sb.from("categories").select("id,name_sv").order("position"),
    sb.from("product_variants").select("label,price_ore,sku").eq("product_id", id).eq("active", true).order("position"),
  ]);
  if (!product) notFound();
  return <div><p className="font-mono text-xs uppercase tracking-wider text-mute">Administration / Produkter</p><h1 className="mt-2 text-4xl font-semibold tracking-tightest">Redigera produkt</h1><ProductForm categories={categories ?? []} product={product} variants={variants ?? []} /></div>;
}

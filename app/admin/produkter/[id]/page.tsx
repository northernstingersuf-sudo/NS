import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import ProductForm from "../ProduktForm";
import VariantImages, { type EditableImage } from "../VariantImages";

export const metadata = { title: "Redigera produkt – Admin", robots: { index: false, follow: false } };

export default async function EditProduct({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sparad?: string; fel?: string; bildsparad?: string; bildfel?: string }>;
}) {
  const { sb } = await requireAdmin();
  const { id } = await params;
  const status = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [product, categories, variants, images] = await Promise.all([
    sb.from("products").select("*").eq("id", id).maybeSingle(),
    sb.from("categories").select("id,name_sv").order("position"),
    sb.from("product_variants").select("id,label,price_ore,sku,active,in_stock").eq("product_id", id).order("position").order("id"),
    sb.from("product_images").select("id,variant_id,url,alt_sv").eq("product_id", id)
      .not("variant_id", "is", null).order("position", { nullsFirst: false }).order("id"),
  ]);
  if (product.error || categories.error || variants.error) throw new Error("Kunde inte läsa produkten.");
  if (!product.data) notFound();
  return (
    <div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tightest">Redigera produkt</h1>
      {status.sparad && <p role="status" className="mt-4 text-sm">Produkten har sparats.</p>}
      {status.fel && <p role="alert" className="mt-4 text-sm text-red-700">{status.fel}</p>}
      <ProductForm categories={categories.data ?? []} product={product.data} variants={variants.data ?? []} />
      {(images.error || !!variants.data?.length) && <div id="variantbilder" className="mt-12 scroll-mt-24 border-t border-line pt-8">
        {status.bildsparad && <p role="status" className="mb-4 text-sm">Bilderna har uppdaterats.</p>}
        {(status.bildfel || images.error) && <p role="alert" className="mb-4 text-sm text-red-700">{status.bildfel ?? "Kunde inte läsa variantbilderna."}</p>}
        {!images.error && variants.data && <VariantImages productId={id} variants={variants.data} images={(images.data ?? []) as EditableImage[]} />}
      </div>}
    </div>
  );
}

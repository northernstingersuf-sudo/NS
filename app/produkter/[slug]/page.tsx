
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getProduct,
  variantsOf,
  fromPrice,
  toPrice,
  inStock,
  productCover,
  productImages,
} from "@/lib/products";
import ProductBuy from "@/components/ProductBuy";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(slug);

  if (!p) return {};
  const cover = productCover(p);

  return {
    title: p.name_sv,
    description: p.description_sv?.slice(0, 155),
    alternates: { canonical: `/produkter/${slug}` },
    openGraph: {
      title: p.name_sv,
      description: p.description_sv?.slice(0, 155) ?? undefined,
      images: cover ? [cover.url] : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const p = await getProduct((await params).slug);

  if (!p) notFound();

  const imgs = productImages(p);
  const variants = variantsOf(p);

  const ld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name_sv,
    description: p.description_sv,
    image: imgs.map((i) => i.url),
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "SEK",
      lowPrice: fromPrice(p) / 100,
      highPrice: toPrice(p) / 100,
      offerCount: Math.max(variants.length, 1),
      availability: inStock(p)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(ld).replace(/</g, "\\u003c"),
        }}
      />

      <ProductBuy
        key={p.id}
        id={p.id}
        slug={p.slug}
        name={p.name_sv}
        categoryName={p.categories?.name_sv ?? null}
        description={p.description_sv}
        basePrice={p.price_ore}
        baseCompare={p.compare_price_ore}
        baseInStock={p.in_stock}
        variants={variants}
        images={imgs}
      />
    </>
  );
}

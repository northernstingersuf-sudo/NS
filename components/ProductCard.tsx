import Image from "next/image";
import Link from "next/link";
import { Product, sek, fromPrice, toPrice, inStock, variantsOf } from "@/lib/products";

export default function ProductCard({ p }: { p: Product }) {
  const img = [...p.product_images].sort((a, b) => a.position - b.position)[0];
  const from = fromPrice(p);
  const range = toPrice(p) !== from;
  const first = variantsOf(p)[0];
  const compare = !range ? (first?.compare_price_ore ?? p.compare_price_ore) : null;
  return (
    <Link href={`/produkter/${p.slug}`} className="group block text-center">
      <div className="relative aspect-square overflow-hidden bg-fog">
        {img ? (
          <Image src={img.url} alt={img.alt_sv ?? p.name_sv} fill sizes="(min-width:1024px) 25vw, 50vw"
            className="object-contain p-4 transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <Image src="/logo/n-black.webp" alt="" width={160} height={160} className="absolute inset-0 m-auto opacity-10" />
        )}
        {!inStock(p) && <span className="absolute left-3 top-3 bg-paper px-2 py-1 font-mono text-[11px] uppercase">Slutsåld</span>}
      </div>
      <h3 className="mt-4 font-mono text-sm">{p.name_sv}</h3>
      <p className="mt-1 font-mono text-xs">
        {range && "Från "}{compare && <s className="mr-2 text-mute">{sek(compare)}</s>}{sek(from)}
      </p>
      {variantsOf(p).length > 1 && <p className="mt-1 font-mono text-[11px] text-mute">{variantsOf(p).length} varianter</p>}
    </Link>
  );
}

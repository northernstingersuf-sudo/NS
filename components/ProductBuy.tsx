
"use client";

import Image from "next/image";
import { useCart } from "./CartProvider";
import type { ProductImage, Variant } from "@/lib/catalog";
import { sek } from "@/lib/money";
import { useState } from "react";

type Props = {
  id: string;
  slug: string;
  name: string;
  categoryName: string | null;
  description: string | null;
  basePrice: number;
  baseCompare: number | null;
  baseInStock: boolean;
  variants: Variant[];
  images: ProductImage[];
};

export default function ProductBuy({
  id,
  slug,
  name,
  categoryName,
  description,
  basePrice,
  baseCompare,
  baseInStock,
  variants,
  images,
}: Props) {
  const { add } = useCart();
  const [sel, setSel] = useState(
    () => Math.max(0, variants.findIndex(v => v.in_stock))
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  const v = variants[sel];
  const price = v ? v.price_ore : basePrice;
  const compare = v ? v.compare_price_ore : baseCompare;
  const ok = v ? v.in_stock : baseInStock;
  const variantImages = v ? images.filter(img => img.variant_id === v.id) : [];
  const sharedImages = images.filter(img => img.variant_id === null);
  const gallery = variantImages.length ? variantImages : sharedImages;
  const image = gallery[imageIndex] ?? gallery[0];

  function stepImage(delta: number) {
    setImageIndex(index => (index + delta + gallery.length) % gallery.length);
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-5 pt-8 sm:px-8 lg:grid-cols-[1.3fr_1fr] lg:gap-12 lg:pt-12">
      <section className="min-w-0" aria-label="Produktbilder">
        <div className="relative aspect-square w-full overflow-hidden bg-fog">
          {image ? (
            <Image
              src={image.url}
              alt={image.alt_sv ?? (v ? name + " – " + v.label : name)}
              fill
              priority={imageIndex === 0}
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="object-contain p-6"
            />
          ) : (
            <Image
              src="/logo/n-black.webp"
              alt=""
              width={200}
              height={200}
              className="absolute inset-0 m-auto opacity-10"
            />
          )}
          {gallery.length > 1 && (
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
              <button type="button" onClick={() => stepImage(-1)} aria-label="Föregående bild"
                className="h-11 w-11 border border-line bg-paper text-lg">←</button>
              <span aria-live="polite" className="bg-paper px-3 py-1 font-mono text-xs">
                Bild {imageIndex + 1} av {gallery.length}
              </span>
              <button type="button" onClick={() => stepImage(1)} aria-label="Nästa bild"
                className="h-11 w-11 border border-line bg-paper text-lg">→</button>
            </div>
          )}
        </div>
        {gallery.length > 1 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {gallery.map((thumbnail, index) => (
              <li key={thumbnail.id}>
                <button type="button" aria-pressed={index === imageIndex}
                  aria-label={"Visa bild " + (index + 1) + (thumbnail.alt_sv ? ", " + thumbnail.alt_sv : "")}
                  onClick={() => setImageIndex(index)}
                  className={"relative block h-16 w-16 border bg-fog sm:h-20 sm:w-20 " + (index === imageIndex ? "border-ink" : "border-line hover:border-ink")}>
                  <Image src={thumbnail.url} alt="" fill sizes="80px" className="object-contain p-2" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        {categoryName && (
          <p className="font-mono text-[11px] uppercase tracking-wider text-mute">
            {categoryName}
          </p>
        )}

        <h1 className="mt-2 font-mono text-3xl">{name}</h1>

        <p className="mt-4 font-mono text-2xl">
          {compare != null && compare > price && (
            <s className="mr-3 text-base text-mute">
              {sek(compare)}
            </s>
          )}
          {sek(price)}
        </p>

        <p role="status" className="mt-2 font-mono text-xs text-mute">
          {ok ? "● Varan finns i lager" : "○ Slut i lager"}
        </p>

        {variants.length > 0 && (
          <fieldset className="mt-8">
            <legend className="mb-3 font-mono text-[11px] uppercase tracking-wider text-mute">
              Variant
            </legend>

            <div className="flex flex-wrap gap-2">
              {variants.map((x, i) => (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={i === sel}
                  onClick={() => {
                    if (i === sel) return;
                    setSel(i);
                    setImageIndex(0);
                    setAnnouncement("");
                  }}
                  className={`border px-5 py-2 font-mono text-xs transition-colors ${
                    i === sel
                      ? "border-ink bg-ink text-paper"
                      : "border-line hover:border-ink"
                  }`}
                >
                  {x.label} · {sek(x.price_ore)}{!x.in_stock && " · Slut i lager"}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <button
          disabled={!ok}
          onClick={() => {
            add({
              id: v?.id ?? id,
              slug,
              name: v ? `${name} – ${v.label}` : name,
              price_ore: price,
            });
            setAnnouncement((v ? name + " – " + v.label : name) + " lades i varukorgen.");
          }}
          className="mt-8 w-full bg-ink py-4 font-mono text-xs uppercase tracking-wider text-paper disabled:bg-line disabled:text-mute"
        >
          {!ok
            ? "Slut i lager"
            : `Lägg i varukorgen · ${sek(price)}`}
        </button>
        <p role="status" className="mt-2 min-h-5 text-sm">{announcement}</p>

        <div className="mt-8 border-t border-line pt-6">
          <h2 className="mb-3 font-mono text-[11px] uppercase tracking-wider text-mute">
            Beskrivning
          </h2>
          <p className="whitespace-pre-line leading-relaxed text-ink/80">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

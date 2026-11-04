
"use client";

import Image from "next/image";
import { useCart } from "./CartProvider";
import { sek, type Variant } from "@/lib/catalog";
import { useEffect, useRef, useState } from "react";

type VariantImage = {
  id: string;
  variant_id: string | null;
  url: string;
  alt_sv: string | null;
  position: number;
};

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
  images: VariantImage[];
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
    Math.max(0, variants.findIndex((v) => v.in_stock))
  );
  const [done, setDone] = useState(false);

  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = imageRef.current;
    if (!el) return;

    el.animate(
      [
        { opacity: 0, transform: "scale(0.94)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      {
        duration: 400,
        easing: "ease-out",
        fill: "both",
      }
    );
  }, [sel]);

  const v = variants[sel];
  const price = v ? v.price_ore : basePrice;
  const compare = v ? v.compare_price_ore : baseCompare;
  const ok = v ? v.in_stock : baseInStock;
  const multi = variants.length > 1;

  const sortedImages = [...images].sort(
    (a, b) => a.position - b.position
  );

  const image =
    (v && sortedImages.find((img) => img.variant_id === v.id)) ??
    sortedImages.find((img) => img.variant_id === null) ??
    (variants.length === 0 ? sortedImages[0] : undefined);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-5 pt-8 sm:px-8 lg:grid-cols-[1.3fr_1fr] lg:gap-12 lg:pt-12">
      <div className="min-w-0">
        <div className="relative aspect-square w-full overflow-hidden bg-fog">
          {image ? (
            <div
              ref={imageRef}
              className="absolute inset-0"
            >
              <Image
                src={image.url}
                alt={image.alt_sv ?? name}
                fill
                priority
                sizes="(min-width:1024px) 55vw, 100vw"
                className="object-contain p-6"
              />
            </div>
          ) : (
            <Image
              src="/logo/n-black.webp"
              alt=""
              width={200}
              height={200}
              className="absolute inset-0 m-auto opacity-10"
            />
          )}
        </div>
      </div>

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

        <p className="mt-2 font-mono text-xs text-mute">
          {ok ? "● Varan finns i lager" : "○ Slut i lager"}
        </p>

        {multi && (
          <fieldset className="mt-8">
            <legend className="mb-3 font-mono text-[11px] uppercase tracking-wider text-mute">
              Variant
            </legend>

            <div className="flex flex-wrap gap-2">
              {variants.map((x, i) => (
                <button
                  key={x.id}
                  type="button"
                  disabled={!x.in_stock}
                  aria-pressed={i === sel}
                  onClick={() => setSel(i)}
                  className={`border px-5 py-2 font-mono text-xs transition-colors disabled:text-mute disabled:line-through ${
                    i === sel
                      ? "border-ink bg-ink text-paper"
                      : "border-line hover:border-ink"
                  }`}
                >
                  {x.label} · {sek(x.price_ore)}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <button
          disabled={!ok}
          aria-live="polite"
          onClick={() => {
            add({
              id: v?.id ?? id,
              slug,
              name: multi && v ? `${name} – ${v.label}` : name,
              price_ore: price,
            });
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          }}
          className="mt-8 w-full bg-ink py-4 font-mono text-xs uppercase tracking-wider text-paper disabled:bg-line disabled:text-mute"
        >
          {!ok
            ? "Slut i lager"
            : done
              ? "Tillagd ✓"
              : `Lägg i varukorgen · ${sek(price)}`}
        </button>

        <div className="mt-10 border-t border-line pt-6">
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

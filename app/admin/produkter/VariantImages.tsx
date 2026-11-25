import Image from "next/image";
import type { EditableVariant } from "./VariantFields";
import { manageVariantImage } from "./image-actions";

export type EditableImage = { id: string; variant_id: string; url: string; alt_sv: string | null };

export default function VariantImages({ productId, variants, images }: {
  productId: string;
  variants: EditableVariant[];
  images: EditableImage[];
}) {
  return (
    <section>
      <h2 className="text-2xl font-semibold">Variantbilder</h2>
      <p className="mt-2 text-sm text-mute">Lägg till två eller tre bilder per variant. Huvudbilden visas först i butiken.</p>
      <div className="mt-5 space-y-4">
        {variants.map(variant => {
          const gallery = images.filter(image => image.variant_id === variant.id);
          return (
            <section key={variant.id} className="border border-line p-4">
              <h3 className="font-semibold">{variant.label} <span className="ml-2 text-xs font-normal text-mute">{gallery.length}/3 bilder</span></h3>
              {gallery.length > 0 && (
                <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {gallery.map((image, index) => (
                    <li key={image.id} className="min-w-0 border border-line">
                      <div className="relative aspect-square bg-fog">
                        <Image src={image.url} alt={image.alt_sv ?? variant.label} fill sizes="(min-width: 640px) 220px, 42vw" className="object-contain p-2" />
                      </div>
                      <form action={manageVariantImage} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-2 text-xs">
                        <input type="hidden" name="productId" value={productId} />
                        <input type="hidden" name="variantId" value={variant.id} />
                        <input type="hidden" name="imageId" value={image.id} />
                        {index === 0 ? <span className="font-semibold">Huvudbild</span> : (
                          <button name="operation" value="cover" className="underline" aria-label={"Gör bild " + (index + 1) + " för " + variant.label + " till huvudbild"}>Gör till huvudbild</button>
                        )}
                        <button name="operation" value="remove" className="text-red-700 underline" aria-label={"Ta bort bild " + (index + 1) + " för " + variant.label}>Ta bort</button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
              {gallery.length < 3 && (
                <form action={manageVariantImage} aria-label={"Ladda upp bild för " + variant.label} className="mt-4 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="productId" value={productId} />
                  <input type="hidden" name="variantId" value={variant.id} />
                  <input type="hidden" name="operation" value="add" />
                  <label className="min-w-0 text-xs text-mute">Bild (JPEG, PNG eller WebP, högst 4 MB)
                    <input type="file" name="image" accept="image/jpeg,image/png,image/webp" required className="mt-1 block w-full max-w-64 text-sm" />
                  </label>
                  <label className="text-xs text-mute">Bildbeskrivning (valfri)
                    <input name="alt" maxLength={160} className="mt-1 block w-full border border-line px-2 py-2 text-sm" />
                  </label>
                  <button className="bg-ink px-4 py-2 text-sm text-paper">Ladda upp</button>
                </form>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

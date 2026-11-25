"use client";

import { useRef, useState } from "react";

export type EditableVariant = {
  id: string;
  label: string;
  price_ore: number;
  sku: string | null;
  active: boolean;
  in_stock: boolean;
};

const input = "mt-1 w-full border border-line bg-transparent px-3 py-2 text-sm";

export default function VariantFields({ variants }: { variants: EditableVariant[] }) {
  const [drafts, setDrafts] = useState<number[]>([]);
  const nextDraft = useRef(0);
  const rows = [
    ...variants.map(variant => ({ key: variant.id, variant })),
    ...drafts.map(draft => ({ key: "new-" + draft, variant: undefined })),
  ];
  return (
    <section>
      <h2 className="text-lg font-semibold">Varianter</h2>
      <p className="mt-1 text-sm text-mute">Spara produkten för att lägga till bilder. Lagerantal ändras under Lager.</p>
      <div className="mt-4 space-y-3">
        {rows.map(({ key, variant }, index) => (
          <fieldset key={key} className="border border-line px-4 pb-4">
            <legend className="px-2 text-sm font-semibold">{variant?.label ?? "Ny variant"}</legend>
            <input type="hidden" name="variant_row" value={key} />
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
              <label className="text-xs text-mute">Namn<input required name={key + "_label"} maxLength={80} className={input} defaultValue={variant?.label} /></label>
              <label className="text-xs text-mute">Pris (kr)<input required name={key + "_price"} inputMode="decimal" className={input} defaultValue={variant ? (variant.price_ore / 100).toFixed(2).replace(".", ",") : undefined} /></label>
              <label className="text-xs text-mute">SKU<input name={key + "_sku"} maxLength={80} className={input} defaultValue={variant?.sku ?? ""} /></label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name={key + "_active"} defaultChecked={variant?.active ?? true} /> Visa i butiken</label>
              <label className="flex items-center gap-2"><input type="checkbox" name={key + "_in_stock"} defaultChecked={variant?.in_stock ?? true} /> Sälj när lager finns</label>
              {!variant && <button type="button" className="underline" aria-label={"Ta bort ny variant " + (index + 1)}
                onClick={() => setDrafts(drafts.filter(draft => key !== "new-" + draft))}>Ta bort</button>}
            </div>
          </fieldset>
        ))}
      </div>
      <button type="button" className="mt-4 border border-line px-4 py-2 text-sm"
        onClick={() => {
          const draft = nextDraft.current++;
          setDrafts(current => [...current, draft]);
        }}>Lägg till variant</button>
    </section>
  );
}

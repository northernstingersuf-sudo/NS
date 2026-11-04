import Link from "next/link";
import { saveProduct } from "./actions";

type CategoryOption = { id: string; name_sv: string };
type VariantOption = { label: string; price_ore: number; sku: string | null };
type ProductFormData = {
  id?: string;
  slug?: string;
  sku?: string | null;
  category_id?: string | null;
  name_sv?: string;
  name_en?: string | null;
  description_sv?: string | null;
  description_en?: string | null;
  price_ore?: number;
  compare_price_ore?: number | null;
  in_stock?: boolean;
  active?: boolean;
  seo_title_sv?: string | null;
  seo_desc_sv?: string | null;
  seo_title_en?: string | null;
  seo_desc_en?: string | null;
};

const input = "mt-1 w-full border border-line bg-transparent px-3 py-2.5 text-sm";
const label = "block text-xs font-medium uppercase tracking-wider text-mute";
const money = (ore?: number | null) => ore == null ? "" : (ore / 100).toFixed(2).replace(".", ",");

export default function ProductForm({ categories, product, variants = [] }: {
  categories: CategoryOption[];
  product?: ProductFormData;
  variants?: VariantOption[];
}) {
  const variantText = variants.map((v) => `${v.label} | ${money(v.price_ore)} | ${v.sku ?? ""}`).join("\n");
  return (
    <form action={saveProduct} className="mt-8 space-y-8">
      {product?.id && <input type="hidden" name="id" value={product.id} />}
      <section className="grid gap-5 sm:grid-cols-2">
        <label className={label}>Produktnamn (svenska)<input className={input} name="name_sv" required maxLength={160} defaultValue={product?.name_sv ?? ""} /></label>
        <label className={label}>Product name (English)<input className={input} name="name_en" maxLength={160} defaultValue={product?.name_en ?? ""} /></label>
        <label className={label}>URL-slug<input className={input} name="slug" required pattern="[a-z0-9]+([a-z0-9-]*[a-z0-9])?" defaultValue={product?.slug ?? ""} placeholder="kedje-stinger" /></label>
        <label className={label}>SKU<input className={input} name="sku" maxLength={80} defaultValue={product?.sku ?? ""} /></label>
        <label className={label}>Kategori<select className={input} name="category_id" defaultValue={product?.category_id ?? ""}><option value="">Ingen kategori</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name_sv}</option>)}</select></label>
        <label className={label}>Ordinarie pris (kr)<input className={input} name="price" inputMode="decimal" placeholder="29,00" defaultValue={money(product?.price_ore)} /></label>
        <label className={label}>Jämförelsepris (kr)<input className={input} name="compare_price" inputMode="decimal" placeholder="Valfritt" defaultValue={money(product?.compare_price_ore)} /></label>
        <div className="flex flex-wrap items-center gap-6 self-end pb-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="in_stock" defaultChecked={product?.in_stock ?? true} /> I lager</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={product?.active ?? false} /> Publicerad</label>
        </div>
      </section>

      <section className="grid gap-5 sm:grid-cols-2">
        <label className={label}>Beskrivning (svenska)<textarea className={`${input} min-h-32`} name="description_sv" maxLength={5000} defaultValue={product?.description_sv ?? ""} /></label>
        <label className={label}>Description (English)<textarea className={`${input} min-h-32`} name="description_en" maxLength={5000} defaultValue={product?.description_en ?? ""} /></label>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Varianter</h2>
        <p className="mt-1 text-sm text-mute">En variant per rad: NAMN | PRIS | SKU. Exempel: SMALL | 29,00 | NS-KS-S. Lämna tomt för en produkt utan varianter.</p>
        <textarea className={`${input} min-h-36 font-mono`} name="variant_lines" spellCheck={false} defaultValue={variantText} placeholder={'SMALL | 29,00 | NS-KS-S\nMEDIUM | 35,00 | NS-KS-M\nLARGE | 39,00 | NS-KS-L'} />
      </section>

      <section className="grid gap-5 sm:grid-cols-2">
        <label className={label}>SEO-titel (svenska)<input className={input} name="seo_title_sv" maxLength={180} defaultValue={product?.seo_title_sv ?? ""} /></label>
        <label className={label}>SEO title (English)<input className={input} name="seo_title_en" maxLength={180} defaultValue={product?.seo_title_en ?? ""} /></label>
        <label className={label}>SEO-beskrivning (svenska)<textarea className={`${input} min-h-24`} name="seo_desc_sv" maxLength={300} defaultValue={product?.seo_desc_sv ?? ""} /></label>
        <label className={label}>SEO description (English)<textarea className={`${input} min-h-24`} name="seo_desc_en" maxLength={300} defaultValue={product?.seo_desc_en ?? ""} /></label>
      </section>

      <div className="flex flex-wrap gap-3 border-t border-line pt-6">
        <button className="bg-ink px-7 py-3 text-sm text-paper">Spara produkt</button>
        <Link href="/admin/produkter" className="border border-line px-7 py-3 text-sm">Avbryt</Link>
      </div>
    </form>
  );
}

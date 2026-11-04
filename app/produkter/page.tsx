import type { Metadata } from "next";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { getCategories, getProducts } from "@/lib/products";

export const revalidate = 60;
export const metadata: Metadata = { title: "Alla produkter", alternates: { canonical: "/produkter" } };

type SP = { kategori?: string; lager?: string; min?: string; max?: string; sort?: string };
const num = (s?: string) => { const n = Number(s); return s && Number.isFinite(n) && n >= 0 ? n : undefined; };
const sorts: [string, string][] = [["", "Nyast"], ["pris-asc", "Pris: lågt till högt"], ["pris-desc", "Pris: högt till lågt"], ["namn", "Namn A–Ö"]];
const box = "w-full border border-line px-3 py-2 font-mono text-xs";

export default async function Products({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sort = sorts.some(([v]) => v === sp.sort) ? sp.sort : "";
  const [products, categories] = await Promise.all([
    getProducts({ category: sp.kategori, stock: sp.lager === "1", minKr: num(sp.min), maxKr: num(sp.max), sort }),
    getCategories(),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-5 pt-16 sm:px-8">
      <h1 className="text-center font-mono text-4xl">{categories.find((c) => c.slug === sp.kategori)?.name_sv ?? "Alla produkter"}</h1>
      <div className="mt-12 grid gap-10 md:grid-cols-[210px_1fr]">
        <form method="get" className="space-y-6 font-mono text-xs">
          {sp.kategori && <input type="hidden" name="kategori" value={sp.kategori} />}
          <div>
            <p className="mb-2 uppercase tracking-wider text-mute">Kategori</p>
            <ul className="space-y-1">
              <li><Link href="/produkter" className={!sp.kategori ? "font-bold" : ""}>Alla</Link></li>
              {categories.map((c) => <li key={c.slug}><Link href={`/produkter?kategori=${c.slug}`} className={sp.kategori === c.slug ? "font-bold" : ""}>{c.name_sv}</Link></li>)}
            </ul>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" name="lager" value="1" defaultChecked={sp.lager === "1"} /> Endast i lager</label>
          <div>
            <p className="mb-2 uppercase tracking-wider text-mute">Pris (kr)</p>
            <div className="flex gap-2">
              <input name="min" type="number" min={0} inputMode="numeric" placeholder="Från" defaultValue={sp.min} aria-label="Lägsta pris" className={box} />
              <input name="max" type="number" min={0} inputMode="numeric" placeholder="Till" defaultValue={sp.max} aria-label="Högsta pris" className={box} />
            </div>
          </div>
          <div>
            <label htmlFor="sort" className="mb-2 block uppercase tracking-wider text-mute">Sortera efter</label>
            <select id="sort" name="sort" defaultValue={sort} className={box}>{sorts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </div>
          <button className="w-full bg-ink py-3 uppercase tracking-wider text-paper">Filtrera</button>
        </form>
        <div>
          <p className="mb-6 text-right font-mono text-xs text-mute">{products.length} produkter</p>
          {products.length ? (
            <div className="grid grid-cols-2 gap-x-5 gap-y-12 lg:grid-cols-3">{products.map((p) => <ProductCard key={p.id} p={p} />)}</div>
          ) : <p className="text-mute">Inga produkter matchar filtret.</p>}
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { getCategories, getProducts } from "@/lib/products";

export const revalidate = 60;

export default async function Home() {
  const [products, categories] = await Promise.all([getProducts({ limit: 8 }), getCategories()]);
  return (
    <>
      <section className="mx-auto max-w-7xl px-5 pb-20 pt-24 sm:px-8 sm:pt-36">
        <h1 className="max-w-[14ch] text-[clamp(3rem,9vw,8rem)] font-semibold leading-[0.92] tracking-tightest">
          Gjort för vattnet.
        </h1>
        <p className="mt-8 max-w-[44ch] text-lg text-mute">
          Fiskeprodukter och kläder från Northern Stingers. Egna designer, tillverkade för långa dagar vid kanten.
        </p>
        <Link href="/produkter" className="mt-10 inline-block bg-ink px-8 py-4 text-sm text-paper transition-colors hover:bg-ink/80">
          Se alla produkter
        </Link>
      </section>

      {categories.length > 0 && (
        <nav aria-label="Kategorier" className="mx-auto flex max-w-7xl flex-wrap gap-3 px-5 sm:px-8">
          {categories.map((c) => (
            <Link key={c.slug} href={`/produkter?kategori=${c.slug}`}
              className="border border-line px-5 py-2 text-sm transition-colors hover:border-ink">{c.name_sv}</Link>
          ))}
        </nav>
      )}

      <section className="mx-auto mt-16 max-w-7xl px-5 sm:px-8">
        <h2 className="mb-10 text-center font-mono text-2xl">Produkter</h2>
        {products.length ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-12 lg:grid-cols-4">
            {products.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        ) : (
          <p className="text-mute">Inga produkter ännu. Lägg till den första i Supabase eller i adminpanelen.</p>
        )}
        {products.length > 0 && <div className="mt-12 text-center"><Link href="/produkter" className="inline-block bg-ink px-10 py-3 font-mono text-xs uppercase tracking-wider text-paper">Visa alla</Link></div>}
      </section>
    </>
  );
}

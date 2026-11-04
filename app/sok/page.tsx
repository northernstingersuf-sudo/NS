import type { Metadata } from "next";
import ProductCard from "@/components/ProductCard";
import { searchProducts } from "@/lib/products";

export const metadata: Metadata = { title: "Sök", robots: { index: false } };

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const results = await searchProducts(q);
  return (
    <div className="mx-auto max-w-7xl px-5 pt-16 sm:px-8">
      <h1 className="text-5xl font-semibold tracking-tightest">Sök</h1>
      <form action="/sok" className="mt-8 flex max-w-xl gap-3">
        <input name="q" defaultValue={q} maxLength={60} aria-label="Sökord" placeholder="Vad letar du efter?" className="w-full border border-line px-4 py-3 text-sm" />
        <button className="bg-ink px-6 text-sm text-paper">Sök</button>
      </form>
      {q && (results.length
        ? <div className="mt-12 grid grid-cols-2 gap-x-5 gap-y-12 lg:grid-cols-4">{results.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        : <p className="mt-12 text-mute">Inga träffar på ”{q}”. Prova ett kortare ord.</p>)}
    </div>
  );
}

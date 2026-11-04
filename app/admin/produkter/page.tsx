import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { setProductActive } from "./actions";

export const metadata = { title: "Produkter – Admin", robots: { index: false, follow: false } };
const sek = (ore: number) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", minimumFractionDigits: 2 }).format(ore / 100);

export default async function AdminProducts({ searchParams }: { searchParams: Promise<{ sparad?: string; uppdaterad?: string; fel?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  const { data: products, error } = await sb.from("products")
    .select("id,slug,name_sv,price_ore,active,in_stock,created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="font-mono text-xs uppercase tracking-wider text-mute">Administration</p><h1 className="mt-2 text-4xl font-semibold tracking-tightest">Produkter</h1></div>
        <Link href="/admin/produkter/ny" className="bg-ink px-5 py-3 text-sm text-paper">+ Ny produkt</Link>
      </div>
      {sp.sparad && <p role="status" className="mt-6 border border-line px-4 py-3 text-sm">Produkten har sparats.</p>}
      {sp.uppdaterad && <p role="status" className="mt-6 border border-line px-4 py-3 text-sm">Publiceringsstatus har uppdaterats.</p>}
      {sp.fel && <p role="alert" className="mt-6 border border-red-300 px-4 py-3 text-sm">{sp.fel}</p>}
      {error ? <p className="mt-8 text-sm text-red-700">Kunde inte läsa produkter. Kontrollera migrationerna och adminbehörigheten.</p> : (
        <div className="mt-8 overflow-x-auto border-y border-line">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-line font-mono text-[11px] uppercase tracking-wider text-mute"><tr><th className="py-3 pr-4">Produkt</th><th className="py-3 pr-4">Pris</th><th className="py-3 pr-4">Lagerflagga</th><th className="py-3 pr-4">Status</th><th className="py-3">Åtgärd</th></tr></thead>
            <tbody className="divide-y divide-line">{(products ?? []).map((p) => (
              <tr key={p.id}>
                <td className="py-4 pr-4"><p className="font-medium">{p.name_sv}</p><p className="mt-1 font-mono text-xs text-mute">/{p.slug}</p></td>
                <td className="py-4 pr-4 tabular-nums">{sek(p.price_ore)}</td>
                <td className="py-4 pr-4">{p.in_stock ? "I lager" : "Slut"}</td>
                <td className="py-4 pr-4">{p.active ? "Publicerad" : "Utkast"}</td>
                <td className="py-4"><div className="flex items-center gap-4"><Link className="underline" href={`/admin/produkter/${p.id}`}>Redigera</Link><form action={setProductActive}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={String(!p.active)} /><button className="text-xs underline">{p.active ? "Avpublicera" : "Publicera"}</button></form></div></td>
              </tr>
            ))}</tbody>
          </table>
          {!products?.length && <p className="py-8 text-sm text-mute">Inga produkter hittades.</p>}
        </div>
      )}
    </div>
  );
}

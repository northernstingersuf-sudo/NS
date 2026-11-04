import { requireAdmin } from "@/lib/admin";
import { adjustStock } from "./actions";

export const metadata = { title: "Lager – Admin", robots: { index: false, follow: false } };
const input = "border border-line bg-transparent px-2 py-1.5 text-sm";

export default async function Stock({ searchParams }: { searchParams: Promise<{ ok?: string; fel?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  const { data: products, error } = await sb.from("products").select("id,name_sv,sku,inventory(quantity,reserved,low_stock_threshold)").order("name_sv");
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-wider text-mute">Administration</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tightest">Lager</h1>
      <p className="mt-3 max-w-2xl text-sm text-mute">Saldot spåras per produkt. Första justeringen börjar spåra saldot; utan saldo styr bara produktens lagerflagga. Reserverat är sålt men ännu inte skickat.</p>
      {sp.ok && <p role="status" className="mt-6 border border-ink px-4 py-3 text-sm">Lagret är justerat.</p>}
      {sp.fel && <p role="alert" className="mt-6 border border-red-300 px-4 py-3 text-sm">{sp.fel}</p>}
      {error ? <p className="mt-8 text-sm text-red-700">Kunde inte läsa lager.</p> : (
        <div className="mt-8 overflow-x-auto border-y border-line"><table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-line font-mono text-[11px] uppercase tracking-wider text-mute"><tr><th className="py-3 pr-4">Produkt</th><th className="py-3 pr-4">Saldo</th><th className="py-3 pr-4">Reserverat</th><th className="py-3 pr-4">Tillgängligt</th><th className="py-3">Justera</th></tr></thead>
          <tbody className="divide-y divide-line">{(products ?? []).map((p) => {
            const inv = (Array.isArray(p.inventory) ? p.inventory[0] : p.inventory) as { quantity: number; reserved: number; low_stock_threshold: number | null } | null | undefined;
            const avail = inv ? inv.quantity - inv.reserved : null;
            return (
              <tr key={p.id}>
                <td className="py-3 pr-4">{p.name_sv}<span className="ml-2 font-mono text-xs text-mute">{p.sku}</span></td>
                <td className="py-3 pr-4 tabular-nums">{inv ? inv.quantity : "Spåras ej"}</td>
                <td className="py-3 pr-4 tabular-nums">{inv ? inv.reserved : "–"}</td>
                <td className={`py-3 pr-4 tabular-nums ${avail !== null && avail <= (inv?.low_stock_threshold ?? 3) ? "font-semibold text-red-700" : ""}`}>{avail ?? "–"}</td>
                <td className="py-3"><form action={adjustStock} className="flex flex-wrap gap-2"><input type="hidden" name="id" value={p.id} />
                  <input name="delta" type="number" step="1" required placeholder="±antal" aria-label={`Ändring för ${p.name_sv}`} className={`${input} w-24`} />
                  <input name="reason" required minLength={3} maxLength={300} placeholder="Orsak" aria-label="Orsak" className={`${input} w-44`} />
                  <button className="bg-ink px-3 py-1.5 text-xs text-paper">Spara</button></form></td>
              </tr>);
          })}</tbody></table></div>
      )}
    </div>
  );
}

import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "Beställningar – Admin", robots: { index: false, follow: false } };
const sek = (ore: number) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", minimumFractionDigits: 2 }).format(ore / 100);
const PAGE = 50;
const STATUS_SV: Record<string, string> = { pending: "Väntande", paid: "Betald", packed: "Packad", shipped: "Skickad", delivered: "Levererad", cancelled: "Avbruten", refunded: "Återbetald" };
const input = "border border-line bg-transparent px-3 py-2 text-sm";
const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; from?: string; to?: string; sida?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.sida) || 1);
  let q = sb.from("orders")
    .select("id,order_number,email,status,total_ore,created_at,payments(status,reported_at)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  const term = (sp.q ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 60);
  if (term) q = q.or(`order_number.ilike.%${term}%,email.ilike.%${term}%`);
  if (sp.status && STATUS_SV[sp.status]) q = q.eq("status", sp.status);
  if (isDate(sp.from)) q = q.gte("created_at", `${sp.from}T00:00:00`);
  if (isDate(sp.to)) q = q.lt("created_at", new Date(new Date(`${sp.to}T00:00:00Z`).getTime() + 86_400_000).toISOString());
  const { data: orders, count, error } = await q;

  const qs = (n: number) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ q: sp.q, status: sp.status, from: sp.from, to: sp.to })) if (v) p.set(k, v); p.set("sida", String(n)); return `?${p}`; };

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-wider text-mute">Administration</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tightest">Beställningar</h1>
      <form className="mt-8 flex flex-wrap items-end gap-3" role="search">
        <label className="text-xs text-mute">Sök<br /><input name="q" defaultValue={sp.q} placeholder="Ordernummer eller e-post" className={`${input} w-64`} /></label>
        <label className="text-xs text-mute">Status<br /><select name="status" defaultValue={sp.status ?? ""} className={input}><option value="">Alla</option>{Object.entries(STATUS_SV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="text-xs text-mute">Från<br /><input type="date" name="from" defaultValue={sp.from} className={input} /></label>
        <label className="text-xs text-mute">Till<br /><input type="date" name="to" defaultValue={sp.to} className={input} /></label>
        <button className="bg-ink px-5 py-2 text-sm text-paper">Filtrera</button>
        <Link href="/admin/ordrar" className="px-2 py-2 text-sm text-mute underline">Rensa</Link>
      </form>
      {error ? <p className="mt-8 text-sm text-red-700">Kunde inte läsa beställningar. Kontrollera att migration 0006 är körd.</p> : !orders?.length ? <p className="mt-8 text-sm text-mute">Inga beställningar matchar.</p> : (
        <div className="mt-8 overflow-x-auto border-y border-line">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line font-mono text-[11px] uppercase tracking-wider text-mute"><tr><th className="py-3 pr-4">Order</th><th className="py-3 pr-4">Kund</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Betalning</th><th className="py-3 pr-4">Datum</th><th className="py-3 text-right">Summa</th></tr></thead>
            <tbody className="divide-y divide-line">{orders.map((o) => {
              const p = (o.payments as unknown as { status: string; reported_at: string | null }[])[0];
              const pay = !p ? "–" : p.status === "paid" ? "Verifierad" : p.status === "refunded" ? "Återbetald" : p.status === "cancelled" ? "Avbruten" : p.reported_at ? "Rapporterad – kontrollera" : "Ej betald";
              return (
                <tr key={o.id}>
                  <td className="py-4 pr-4 font-mono"><Link href={`/admin/ordrar/${o.id}`} className="underline">{o.order_number ?? o.id.slice(0, 8).toUpperCase()}</Link></td>
                  <td className="py-4 pr-4">{o.email}</td><td className="py-4 pr-4">{STATUS_SV[o.status] ?? o.status}</td>
                  <td className={`py-4 pr-4 ${pay.startsWith("Rapporterad") ? "font-semibold" : ""}`}>{pay}</td>
                  <td className="py-4 pr-4">{new Date(o.created_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="py-4 text-right tabular-nums">{sek(o.total_ore)}</td>
                </tr>);
            })}</tbody>
          </table>
        </div>
      )}
      <div className="mt-6 flex items-center justify-between text-sm">
        <span className="text-mute">{count ?? 0} beställningar</span>
        <span className="flex gap-4">{page > 1 && <Link href={qs(page - 1)} className="underline">← Föregående</Link>}{(count ?? 0) > page * PAGE && <Link href={qs(page + 1)} className="underline">Nästa →</Link>}</span>
      </div>
    </div>
  );
}

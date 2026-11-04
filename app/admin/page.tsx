import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "Översikt – Admin", robots: { index: false, follow: false } };
const sek = (ore: number) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", minimumFractionDigits: 2 }).format(ore / 100);

export default async function Dashboard() {
  const { sb } = await requireAdmin();
  const count = async (table: string, apply?: (q: any) => any) => {
    let q = sb.from(table).select("*", { count: "exact", head: true });
    if (apply) q = apply(q);
    const { count: n, error } = await q;
    return error ? null : (n ?? 0);
  };
  const [products, orders, waiting, reported, customers, subscribers, lowStock, payments, latest] = await Promise.all([
    count("products", (q) => q.eq("active", true)),
    count("orders"),
    count("payments", (q) => q.in("status", ["initiated"])),
    count("payments", (q) => q.eq("status", "initiated").not("reported_at", "is", null)),
    count("profiles", (q) => q.eq("role", "customer")),
    count("newsletter_subscribers"),
    count("inventory", (q) => q.lte("quantity", 3)),
    sb.from("payments").select("amount_ore,refunded_ore").eq("status", "paid"),
    sb.from("orders").select("id,order_number,email,status,total_ore,created_at").order("created_at", { ascending: false }).limit(6),
  ]);
  const revenueOre = (payments.data ?? []).reduce((sum, p) => sum + Math.max(0, p.amount_ore - (p.refunded_ore ?? 0)), 0);
  const cards = [
    ["Verifierad omsättning", sek(revenueOre)],
    ["Beställningar", orders === null ? "—" : String(orders)],
    ["Obetalda order (ej verifierade)", waiting === null ? "—" : String(waiting)],
    ["Kund rapporterat betalning – kontrollera", reported === null ? "—" : String(reported)],
    ["Publicerade produkter", products === null ? "—" : String(products)],
    ["Lågt lagersaldo", lowStock === null ? "—" : String(lowStock)],
    ["Kunder", customers === null ? "—" : String(customers)],
    ["Nyhetsbrevsprenumeranter", subscribers === null ? "—" : String(subscribers)],
  ] as const;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-xs uppercase tracking-wider text-mute">Northern Stingers</p><h1 className="mt-2 text-4xl font-semibold tracking-tightest">Översikt</h1></div><Link href="/admin/produkter" className="border border-ink px-5 py-3 text-sm">Hantera produkter</Link></div>
      <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="border border-line p-5"><dt className="text-xs text-mute">{label}</dt><dd className="mt-3 text-2xl font-semibold tabular-nums">{value}</dd></div>)}</dl>
      <section className="mt-12"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Senaste beställningar</h2><span className="text-xs text-mute">Senast skapade</span></div>
        {latest.error ? <p className="mt-4 text-sm text-mute">Kunde inte läsa beställningar. Kontrollera databasmigrationerna.</p> : latest.data?.length ? <div className="mt-4 overflow-x-auto border-y border-line"><table className="w-full min-w-[580px] text-left text-sm"><thead className="border-b border-line font-mono text-[11px] uppercase tracking-wider text-mute"><tr><th className="py-3 pr-4">Order</th><th className="py-3 pr-4">Kund</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Datum</th><th className="py-3 text-right">Summa</th></tr></thead><tbody className="divide-y divide-line">{latest.data.map((o) => <tr key={o.id}><td className="py-4 pr-4 font-mono"><Link href={`/admin/ordrar/${o.id}`} className="underline">{o.order_number ?? o.id.slice(0, 8).toUpperCase()}</Link></td><td className="py-4 pr-4">{o.email}</td><td className="py-4 pr-4">{o.status}</td><td className="py-4 pr-4">{new Date(o.created_at).toLocaleDateString("sv-SE")}</td><td className="py-4 text-right tabular-nums">{sek(o.total_ore)}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-mute">Inga beställningar ännu.</p>}
      </section>
      <p className="mt-8 max-w-3xl text-xs leading-relaxed text-mute">Omsättningen räknas enbart från betalningar som har verifierats som betalda, minus registrerade återbetalningar. Väntande betalningar ingår inte. Värden som inte kan läsas visas som streck i stället för att ersättas med exempeldata.</p>
    </>
  );
}

import { requireAdmin } from "@/lib/admin";
import { stockByScope, type StockBalance } from "@/lib/stock";
import { adjustStock } from "./actions";

export const metadata = { title: "Lager – Admin", robots: { index: false, follow: false } };
const input = "mt-1 w-full border border-line bg-paper px-3 py-2 text-sm";
type Balance = StockBalance & { low_stock_threshold: number | null };

function StockRow({ name, sku, productId, variantId, balance, shared, active = true }: {
  name: string;
  sku: string | null;
  productId: string;
  variantId?: string;
  balance?: Balance;
  shared?: Balance;
  active?: boolean;
}) {
  const available = balance ? balance.quantity - balance.reserved : null;
  const sharedAvailable = shared ? shared.quantity - shared.reserved : null;
  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(9rem,1fr)_minmax(12rem,1.2fr)_minmax(21rem,2.4fr)] lg:items-center">
      <div>
        <h3 className="font-semibold">{name}</h3>
        {sku && <p className="mt-1 font-mono text-xs text-mute">{sku}</p>}
        {!active && <p className="mt-1 text-xs text-mute">Inaktiv variant</p>}
      </div>
      {balance && available !== null ? (
        <dl className="grid grid-cols-3 gap-2 text-xs text-mute">
          <div><dt>Saldo</dt><dd className="mt-1 text-sm tabular-nums text-ink">{balance.quantity}</dd></div>
          <div><dt>Reserverat</dt><dd className="mt-1 text-sm tabular-nums text-ink">{balance.reserved}</dd></div>
          <div><dt>Tillgängligt</dt><dd className={available <= (balance.low_stock_threshold ?? 3) ? "mt-1 text-sm font-semibold tabular-nums text-red-700" : "mt-1 text-sm tabular-nums text-ink"}>{available}</dd></div>
        </dl>
      ) : <p className="text-sm text-mute">{variantId && shared ? "Använder gemensamt saldo" : "Spåras ej"}</p>}
      <form action={adjustStock} aria-label={"Lagerjustering för " + name} className="grid grid-cols-[5.5rem_1fr_auto] items-end gap-2">
        <input type="hidden" name="id" value={productId} />
        {variantId && <input type="hidden" name="variantId" value={variantId} />}
        {variantId && sharedAvailable !== null && sharedAvailable > 0 && (
          <label className="col-span-3 text-xs text-mute">
            Åtgärd
            <select name="operation" className={input} defaultValue={balance ? "adjust" : "transfer"}>
              <option value="transfer">Flytta från gemensamt saldo ({sharedAvailable} kvar)</option>
              <option value="adjust">Justera variantens saldo</option>
            </select>
          </label>
        )}
        <label className="text-xs text-mute">Antal<input name="delta" type="number" step="1" min={-100000} max={100000} required placeholder="±" className={input} /></label>
        <label className="text-xs text-mute">Orsak<input name="reason" required minLength={3} maxLength={300} className={input} /></label>
        <button className="bg-ink px-3 py-2.5 text-xs text-paper">Spara</button>
      </form>
    </div>
  );
}

export default async function Stock({ searchParams }: { searchParams: Promise<{ ok?: string; fel?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  const [products, stock] = await Promise.all([
    sb.from("products").select("id,name_sv,sku,product_variants(id,label,sku,active,position)").order("name_sv"),
    sb.from("stock_balances").select("product_id,variant_id,quantity,reserved,low_stock_threshold"),
  ]);
  const balances = stockByScope((stock.data ?? []) as Balance[]);
  return (
    <div>
      <h1 className="text-4xl font-semibold tracking-tightest">Lager</h1>
      <p className="mt-3 max-w-2xl text-sm text-mute">Flytta inventerade enheter från gemensamt saldo till respektive variant. Ange 0 för att börja spåra en variant som är slut. Äldre reservationer ligger kvar på det gemensamma saldot tills beställningen skickas eller avbryts.</p>
      {sp.ok && <p role="status" className="mt-6 border border-ink px-4 py-3 text-sm">Lagret är justerat.</p>}
      {sp.fel && <p role="alert" className="mt-6 border border-red-300 px-4 py-3 text-sm">{sp.fel}</p>}
      {products.error || stock.error ? <p role="alert" className="mt-8 text-sm text-red-700">Kunde inte läsa lager.</p> : (
        <div className="mt-8 space-y-5">
          {(products.data ?? []).map(p => {
            const shared = balances.products.get(p.id);
            const variants = [...p.product_variants].sort((a, b) => a.position - b.position);
            return (
              <section key={p.id} className="divide-y divide-line border border-line">
                <h2 className="bg-fog px-4 py-3 text-lg font-semibold">{p.name_sv}</h2>
                {(!variants.some(v => v.active) || shared) && (
                  <StockRow name={variants.some(v => v.active) ? "Gemensamt saldo" : "Produktsaldo"} sku={p.sku} productId={p.id} balance={shared} />
                )}
                {variants.map(v => (
                  <StockRow key={v.id} name={v.label} sku={v.sku} productId={p.id} variantId={v.id}
                    balance={balances.variants.get(v.id)} shared={shared} active={v.active} />
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

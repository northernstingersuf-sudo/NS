import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { registerRefund, retryNotification, updateOrder, verifyPayment } from "../actions";

export const metadata = { title: "Order – Admin", robots: { index: false, follow: false } };
const sek = (ore: number) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", minimumFractionDigits: 2 }).format(ore / 100);
const STATUS_SV: Record<string, string> = { pending: "Väntande", paid: "Betald", packed: "Packad", shipped: "Skickad", delivered: "Levererad", cancelled: "Avbruten", refunded: "Återbetald" };
const EVENT_SV: Record<string, string> = { order_created: "Order skapad", payment_reported: "Kunden rapporterade betalning", payment_verified: "Betalning verifierad av admin", status_changed: "Status ändrad", tracking_set: "Spårningsnummer satt", refund_registered: "Återbetalning registrerad (administrativ)" };
const NEXT: Record<string, { value: string; label: string }[]> = {
  paid: [{ value: "packed", label: "Markera som packad" }, { value: "cancelled", label: "Avbryt order" }],
  packed: [{ value: "shipped", label: "Markera som skickad" }, { value: "cancelled", label: "Avbryt order" }],
  shipped: [{ value: "delivered", label: "Markera som levererad" }],
  pending: [{ value: "cancelled", label: "Avbryt order" }],
};
const box = "border border-line p-5";
const input = "mt-1 w-full border border-line bg-transparent px-3 py-2 text-sm";

export default async function AdminOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; fel?: string }> }) {
  const { sb } = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: o }, { data: events }, { data: notes }] = await Promise.all([
    sb.from("orders").select("*,order_items(*),payments(*)").eq("id", id).maybeSingle(),
    sb.from("order_events").select("id,kind,detail,created_at").eq("order_id", id).order("created_at"),
    sb.from("notification_log").select("kind,status,attempts,last_error,sent_at").eq("order_id", id),
  ]);
  if (!o) notFound();
  const pay = (o.payments as any[])[0];
  const a = o.shipping_address ?? {};
  const canVerify = o.status === "pending" && pay?.status === "initiated";
  const canRefund = pay?.status === "paid" && pay.refunded_ore < pay.amount_ore;
  const options = NEXT[o.status] ?? [];

  return (
    <div>
      <Link href="/admin/ordrar" className="text-sm text-mute underline">← Alla beställningar</Link>
      <h1 className="mt-4 text-4xl font-semibold tracking-tightest"><span className="font-mono">{o.order_number ?? o.id.slice(0, 8)}</span></h1>
      <p className="mt-2 text-sm text-mute">{STATUS_SV[o.status]} · {new Date(o.created_at).toLocaleString("sv-SE")} · {o.email}</p>
      {sp.ok && <p role="status" className="mt-6 border border-ink px-4 py-3 text-sm">{sp.ok}</p>}
      {sp.fel && <p role="alert" className="mt-6 border border-red-300 px-4 py-3 text-sm">{sp.fel}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className={box} aria-labelledby="betalning">
          <h2 id="betalning" className="text-lg font-semibold">Betalning (Swish, manuell kontroll)</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt>Förväntat belopp</dt><dd className="tabular-nums">{sek(o.total_ore)}</dd></div>
            <div className="flex justify-between"><dt>Referens/meddelande</dt><dd className="font-mono">{pay?.reference ?? "–"}</dd></div>
            <div className="flex justify-between"><dt>Status</dt><dd>{pay?.status === "paid" ? "Verifierad betald" : pay?.status === "initiated" ? "Ej verifierad" : pay?.status}</dd></div>
            <div className="flex justify-between"><dt>Kund rapporterat betalning</dt><dd>{pay?.reported_at ? new Date(pay.reported_at).toLocaleString("sv-SE") : "Nej"}</dd></div>
            {pay?.verified_at && <div className="flex justify-between"><dt>Verifierad</dt><dd>{new Date(pay.verified_at).toLocaleString("sv-SE")}</dd></div>}
            {pay?.refunded_ore > 0 && <div className="flex justify-between"><dt>Återbetalt (registrerat)</dt><dd className="tabular-nums">{sek(pay.refunded_ore)}</dd></div>}
          </dl>
          {canVerify && (
            <form action={verifyPayment} className="mt-5 space-y-3 border-t border-line pt-5">
              <input type="hidden" name="id" value={o.id} />
              <label className="block text-xs text-mute">Belopp som kommit in (kr)<input name="received" required inputMode="decimal" placeholder={(o.total_ore / 100).toFixed(2).replace(".", ",")} className={input} /></label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" required className="mt-1" /> Jag har kontrollerat i företagets Swish-app/bankkonto att betalningen med referens {pay?.reference} har kommit in.</label>
              <button className="w-full bg-ink py-3 text-sm text-paper">Verifiera betalning</button>
            </form>
          )}
          {canRefund && (
            <form action={registerRefund} className="mt-5 space-y-3 border-t border-line pt-5">
              <input type="hidden" name="id" value={o.id} />
              <p className="text-xs text-mute">Registrerar bara en administrativ status. Pengarna återbetalas manuellt i Swish/bank.</p>
              <label className="block text-xs text-mute">Belopp (kr)<input name="amount" required inputMode="decimal" placeholder={((pay.amount_ore - pay.refunded_ore) / 100).toFixed(2).replace(".", ",")} className={input} /></label>
              <label className="block text-xs text-mute">Anteckning<input name="note" maxLength={300} className={input} /></label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" required className="mt-1" /> Återbetalningen är gjord eller görs manuellt.</label>
              <button className="w-full border border-ink py-3 text-sm">Registrera återbetalning</button>
            </form>
          )}
        </section>

        <section className={box} aria-labelledby="hantera">
          <h2 id="hantera" className="text-lg font-semibold">Hantera order</h2>
          <form action={updateOrder} className="mt-3 space-y-3">
            <input type="hidden" name="id" value={o.id} />
            <label className="block text-xs text-mute">Spårningsnummer<input name="tracking" defaultValue={o.tracking_number ?? ""} maxLength={80} className={input} /></label>
            <div className="flex flex-wrap gap-2">
              <button name="status" value="" className="border border-ink px-4 py-2 text-sm">Spara spårningsnummer</button>
              {options.map((opt) => <button key={opt.value} name="status" value={opt.value} className={`px-4 py-2 text-sm ${opt.value === "cancelled" ? "border border-red-400 text-red-800" : "bg-ink text-paper"}`}>{opt.label}</button>)}
            </div>
            {o.status === "pending" && <p className="text-xs text-mute">Betald kan en order bara bli via verifiering av betalningen.</p>}
            {pay?.status === "paid" && <p className="text-xs text-mute">Avbryter du en betald order: registrera även en återbetalning.</p>}
          </form>
          <h3 className="mt-6 text-sm font-semibold">Leverans</h3>
          <p className="mt-1 text-sm">{[a.name, a.line1, a.line2, `${a.postal_code ?? ""} ${a.city ?? ""}`, a.phone].filter(Boolean).join(" · ")}</p>
        </section>
      </div>

      <section className="mt-8" aria-labelledby="rader">
        <h2 id="rader" className="text-lg font-semibold">Orderrader</h2>
        <div className="mt-3 overflow-x-auto border-y border-line"><table className="w-full min-w-[520px] text-left text-sm"><tbody className="divide-y divide-line">
          {(o.order_items as any[]).map((i) => <tr key={i.id}><td className="py-3 pr-4">{i.name}{i.variant ? ` – ${i.variant}` : ""}<span className="ml-2 font-mono text-xs text-mute">{i.sku}</span></td><td className="py-3 pr-4">{i.quantity} × {sek(i.unit_price_ore)}</td><td className="py-3 text-right tabular-nums">{sek(i.quantity * i.unit_price_ore)}</td></tr>)}
          <tr><td colSpan={2} className="py-2 text-right text-mute">Delsumma</td><td className="py-2 text-right tabular-nums">{sek(o.subtotal_ore)}</td></tr>
          {o.discount_ore > 0 && <tr><td colSpan={2} className="py-2 text-right text-mute">Rabatt {o.discount_code}</td><td className="py-2 text-right tabular-nums">−{sek(o.discount_ore)}</td></tr>}
          <tr><td colSpan={2} className="py-2 text-right text-mute">Frakt</td><td className="py-2 text-right tabular-nums">{sek(o.shipping_ore)}</td></tr>
          <tr><td colSpan={2} className="py-2 text-right font-semibold">Totalt</td><td className="py-2 text-right font-semibold tabular-nums">{sek(o.total_ore)}</td></tr>
        </tbody></table></div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className={box} aria-labelledby="historik">
          <h2 id="historik" className="text-lg font-semibold">Händelser</h2>
          <ol className="mt-3 space-y-2 text-sm">{(events ?? []).map((e) => <li key={e.id}><span className="text-mute">{new Date(e.created_at).toLocaleString("sv-SE")}</span> · {EVENT_SV[e.kind] ?? e.kind}{e.kind === "status_changed" && e.detail ? `: ${STATUS_SV[(e.detail as any).from]} → ${STATUS_SV[(e.detail as any).to]}` : ""}</li>)}</ol>
        </section>
        <section className={box} aria-labelledby="discord">
          <h2 id="discord" className="text-lg font-semibold">Discord-notiser</h2>
          {!notes?.length ? <p className="mt-3 text-sm text-mute">Inga notiser registrerade.</p> : <ul className="mt-3 space-y-3 text-sm">{notes.map((n) => (
            <li key={n.kind} className="flex items-start justify-between gap-3">
              <span>{n.kind === "order_created" ? "Ny order" : "Betalning rapporterad"}: <b>{n.status === "sent" ? "skickad" : n.status === "failed" ? "misslyckades" : "pågår"}</b> ({n.attempts} försök){n.last_error ? <span className="block font-mono text-xs text-red-700">{n.last_error}</span> : null}</span>
              {n.status !== "sent" && <form action={retryNotification}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="kind" value={n.kind} /><button className="border border-ink px-3 py-1 text-xs">Försök igen</button></form>}
            </li>))}</ul>}
        </section>
      </div>
    </div>
  );
}

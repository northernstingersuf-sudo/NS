import { requireAdmin } from "@/lib/admin";
import { markWithdrawalReviewed, retryWithdrawalReceipt } from "./actions";

export const metadata = { title: "Ångermeddelanden – Admin", robots: { index: false, follow: false } };
const date = (value: string | null) => value ? new Date(value).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Stockholm" }) : "–";

export default async function WithdrawalAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; fel?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  const { data: rows, error } = await sb.from("withdrawal_requests")
    .select("id,order_number,customer_name,customer_email,message,received_at,receipt_sent_at,receipt_error,status")
    .order("received_at", { ascending: false }).limit(100);
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-wider text-mute">Administration</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tightest">Ångermeddelanden</h1>
      {sp.ok && <p role="status" className="mt-6 border border-line px-4 py-3 text-sm">{sp.ok}</p>}
      {sp.fel && <p role="alert" className="mt-6 border border-red-300 px-4 py-3 text-sm">{sp.fel}</p>}
      <p className="mt-4 max-w-3xl text-sm text-mute">Här visas ångermeddelanden som skickats via webbplatsens formulär. Mottagningsbevis ska skickas utan dröjsmål. Att granska ett ärende eller registrera en återbetalning är separata åtgärder.</p>
      {error ? <p className="mt-8 text-sm text-red-700">Kunde inte läsa ärenden. Kör migration 0011.</p> : !rows?.length ? <p className="mt-8 text-sm text-mute">Inga ångermeddelanden har kommit in.</p> : (
        <div className="mt-8 space-y-4">{rows.map((row) => <article key={row.id} className="border border-line p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{row.order_number}</h2><p className="mt-1 text-sm">{row.customer_name} · {row.customer_email}</p></div><span className="text-xs text-mute">{row.status === "received" ? "Mottaget" : row.status === "reviewed" ? "Granskat" : "Avslutat"}</span></div>
          <dl className="mt-4 grid gap-2 text-xs text-mute sm:grid-cols-3"><div><dt>Mottaget</dt><dd>{date(row.received_at)}</dd></div><div><dt>Mottagningsbevis</dt><dd>{row.receipt_sent_at ? `Skickat ${date(row.receipt_sent_at)}` : row.receipt_error ? `Fel: ${row.receipt_error}` : "Inte skickat"}</dd></div><div><dt>Ärende-ID</dt><dd className="font-mono">{row.id}</dd></div></dl>
          {row.message && <p className="mt-4 whitespace-pre-wrap text-sm">{row.message}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            {!row.receipt_sent_at && <form action={retryWithdrawalReceipt}><input type="hidden" name="id" value={row.id} /><button className="border border-ink px-4 py-2 text-xs">Skicka mottagningsbevis igen</button></form>}
            {row.status === "received" && <form action={markWithdrawalReviewed}><input type="hidden" name="id" value={row.id} /><button className="bg-ink px-4 py-2 text-xs text-paper">Markera som granskat</button></form>}
          </div>
        </article>)}</div>
      )}
      <p className="mt-4 text-xs text-mute">Visar de 100 senaste ärendena.</p>
    </div>
  );
}

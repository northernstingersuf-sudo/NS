import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "Nyhetsbrev – Admin", robots: { index: false, follow: false } };
const date = (value: string | null) => value ? new Date(value).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "–";

export default async function NewsletterAdmin() {
  const { sb } = await requireAdmin();
  const { data, error, count } = await sb.from("newsletter_subscribers")
    .select("id,email,consented_at,consent_source,consent_version,consent_text,unsubscribed_at,confirmed_at", { count: "exact" })
    .order("consented_at", { ascending: false }).limit(250);
  const list = data ?? [];
  const active = list.filter((x) => !x.unsubscribed_at && Boolean(x.confirmed_at)).length;
  const pending = list.filter((x) => !x.unsubscribed_at && !x.confirmed_at).length;
  const inactive = list.filter((x) => Boolean(x.unsubscribed_at)).length;

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-wider text-mute">Administration</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><h1 className="text-4xl font-semibold tracking-tightest">Nyhetsbrev</h1>
        <a href="/admin/nyhetsbrev/export" className="bg-ink px-5 py-3 text-sm text-paper">Exportera aktiva prenumeranter (CSV)</a>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="border border-line p-5"><p className="text-xs text-mute">Totalt i listan</p><p className="mt-2 text-2xl font-semibold tabular-nums">{count ?? "–"}</p></div>
        <div className="border border-line p-5"><p className="text-xs text-mute">Aktiva i de 250 senaste</p><p className="mt-2 text-2xl font-semibold tabular-nums">{active}</p></div>
        <div className="border border-line p-5"><p className="text-xs text-mute">Väntar på bekräftelse</p><p className="mt-2 text-2xl font-semibold tabular-nums">{pending}</p></div>
      </div>
      <p className="mt-5 max-w-3xl text-sm text-mute">CSV-exporten innehåller endast aktiva adresser med registrerad aktuell samtyckesversion och en unik avregistreringslänk per mottagare. Skydda filen och inkludera länken i varje kampanjutskick. Poster märkta <span className="font-mono">legacy-unverified</span> saknar historiskt sparad samtyckestext. Säkerställ att det finns ett giltigt tidigare samtycke innan de används för marknadsföringsutskick.</p>
      {error ? <p role="alert" className="mt-8 text-sm text-red-700">Kunde inte läsa prenumeranter. Kör migration 0011 och 0012.</p> : !list.length ? <p className="mt-8 text-sm text-mute">Inga prenumeranter ännu.</p> : (
        <div className="mt-8 overflow-x-auto border-y border-line">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line font-mono text-[11px] uppercase tracking-wider text-mute"><tr><th className="py-3 pr-4">E-post</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Samtycke</th><th className="py-3 pr-4">Källa/version</th><th className="py-3 pr-4">Samtyckestext</th><th className="py-3 pr-4">Bekräftad</th><th className="py-3">Avregistrerad</th></tr></thead>
            <tbody className="divide-y divide-line">{list.map((row) => <tr key={row.id}>
              <td className="py-3 pr-4">{row.email}</td>
              <td className="py-3 pr-4">{row.unsubscribed_at ? "Avregistrerad" : !row.confirmed_at ? "Väntar på bekräftelse" : row.consent_version === "legacy-unverified" ? "Bekräftad – äldre samtycke" : "Aktiv – bekräftad"}</td>
              <td className="py-3 pr-4">{date(row.consented_at)}</td>
              <td className="py-3 pr-4 text-xs text-mute">{row.consent_source} / {row.consent_version}</td>
              <td className="max-w-sm py-3 pr-4 text-xs text-mute">{row.consent_text}</td>
              <td className="py-3 pr-4">{date(row.confirmed_at)}</td><td className="py-3">{date(row.unsubscribed_at)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {list.length >= 250 && <p className="mt-4 text-xs text-mute">Visar de 250 senaste posterna. CSV-exporten innehåller samtliga aktiva poster.</p>}
    </div>
  );
}

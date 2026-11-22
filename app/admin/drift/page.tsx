import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { operationalSignals } from "@/lib/operational-monitoring";

export const metadata = { title: "Driftstatus – Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const { sb } = await requireAdmin();
  const now = Date.now();
  const cutoff = new Date(now - 2 * 60 * 60_000).toISOString();
  const count = async (table: string, filter: (q: any) => any): Promise<number | null> => {
    const { count, error } = await filter(sb.from(table).select("id", { count: "exact", head: true }));
    if (error) { console.error(`[operations] unable to count ${table} (${error.code})`); return null; }
    return count ?? 0;
  };
  const [lastRun, expiredOrders, reported, emails, discord, stock] = await Promise.all([
    sb.from("system_job_runs").select("created_at,processed").eq("job_name", "expire_unpaid_orders")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    count("payments", q => q.eq("status", "initiated").is("reported_at", null)
      .eq("orders.status", "pending").lte("orders.created_at", cutoff)),
    count("payments", q => q.eq("status", "initiated").not("reported_at", "is", null)),
    count("email_log", q => q.eq("status", "failed")),
    count("notification_log", q => q.eq("status", "failed")),
    sb.from("inventory").select("quantity,reserved,low_stock_threshold").limit(1000),
  ]);

  // payments -> orders join must be inner to enforce the pending-order filters.
  // An incorrect relationship query returns an error and is shown as unavailable.
  const eligible = expiredOrders;
  const lowStock = stock.error ? null
    : (stock.data ?? []).filter(x => x.quantity - x.reserved <= (x.low_stock_threshold ?? 3)).length;
  const signals = operationalSignals({
    now, lastExpiryRun: lastRun.error ? null : lastRun.data?.created_at ?? null,
    eligibleExpiredOrders: eligible, reportedPayments: reported,
    failedEmails: emails, failedDiscord: discord, lowStockProducts: lowStock,
  });
  return (
    <div className="pb-16">
      <p className="font-mono text-xs uppercase tracking-wider text-mute">Admin / Drift</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-4xl font-semibold tracking-tightest">Driftstatus</h1>
        <Link href="/admin/ordrar" className="border border-ink px-5 py-3 text-sm">Granska beställningar</Link>
      </div>
      <p className="mt-5 max-w-3xl text-sm text-mute">
        Status för automatisk orderstädning, betalningsrapporter, e-post och Discord.
        Uppdatera sidan för aktuella värden. Stäng inte manuellt rapporterade Swish-betalningar utan kontroll.
      </p>
      {lastRun.error && <p role="alert" className="mt-6 border border-red-400 p-4 text-sm">Kunde inte läsa schemalagd körning. Kontrollera migration 0014 och RLS.</p>}
      <dl className="mt-8 grid gap-4 md:grid-cols-2">
        {signals.map(s => <div key={s.label} className="border border-line p-5">
          <dt className="flex items-start justify-between gap-4 text-sm font-semibold">
            <span>{s.label}</span>
            <span aria-label={s.status === "ok" ? "OK" : s.status === "warning" ? "Behöver uppmärksamhet" : "Fel"} className={s.status === "ok" ? "text-green-700" : s.status === "warning" ? "text-amber-700" : "text-red-700"}>
              {s.status === "ok" ? "OK" : s.status === "warning" ? "Kontrollera" : "Åtgärda"}
            </span>
          </dt>
          <dd className="mt-3 text-3xl font-semibold tabular-nums">{s.value}</dd>
          <p className="mt-3 text-xs leading-relaxed text-mute">{s.detail}</p>
        </div>)}
      </dl>
      <p className="mt-6 text-xs text-mute">
        Cron loggar en körning var femte minut när migration 0014 är aktiverad.
        Saknade värden visas som fel, inte som noll. Det här är en intern översikt,
        inte ett externt jourlarm.
      </p>
    </div>
  );
}

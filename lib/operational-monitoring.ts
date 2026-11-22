export type OperationalSeverity = "ok" | "warning" | "critical";
export type OperationalInputs = {
  now: number;
  lastExpiryRun: string | null;
  eligibleExpiredOrders: number | null;
  reportedPayments: number | null;
  failedEmails: number | null;
  failedDiscord: number | null;
  lowStockProducts: number | null;
};
export type OperationalSignal = { label: string; status: OperationalSeverity; value: string; detail: string };

/** Pure health classification: no customer details, credentials, or database imports. */
export function operationalSignals(x: OperationalInputs): OperationalSignal[] {
  const lastRunMs = x.lastExpiryRun ? Date.parse(x.lastExpiryRun) : NaN;
  const ageMs = x.now - lastRunMs;
  const scheduler: OperationalSeverity = !Number.isFinite(lastRunMs) || ageMs > 15 * 60_000 || ageMs < -60_000 ? "critical" : "ok";
  const countSignal = (label: string, value: number | null, detail: string): OperationalSignal => ({
    label, value: value === null ? "—" : String(value),
    status: value === null ? "critical" : value > 0 ? "warning" : "ok",
    detail: value === null ? "Datakälla otillgänglig. " + detail : detail,
  });
  return [
    { label: "Automatisk orderstädning", status: scheduler,
      value: !Number.isFinite(lastRunMs) ? "Ingen körning" : scheduler === "ok" ? "Aktiv" : "Försenad",
      detail: "Senaste körning: " + (Number.isFinite(lastRunMs) ? new Date(lastRunMs).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" }) : "saknas") },
    countSignal("Obetalda order över 2 timmar", x.eligibleExpiredOrders, "Ska normalt behandlas av nästa cron-körning (endast utan betalningsrapport)."),
    countSignal("Betalningar rapporterade för kontroll", x.reportedPayments, "Dessa order autoavbokas inte; verifiera Swish manuellt."),
    countSignal("Misslyckade kundmejl", x.failedEmails, "Öppna ordern och försök skicka mejlet igen."),
    countSignal("Misslyckade Discord-notiser", x.failedDiscord, "Öppna ordern och försök skicka notisen igen."),
    countSignal("Produkter med lågt tillgängligt lager", x.lowStockProducts, "Kontrollera lager: saldo minus reservationer."),
  ];
}

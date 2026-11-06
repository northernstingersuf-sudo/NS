import { requireAdmin } from "@/lib/admin";
import { SITE_URL } from "@/lib/site";

const csv = (value: unknown) => {
  let text = String(value ?? "");
  // Spreadsheet formula-injection protection for CSV consumers.
  if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export async function GET() {
  const { sb, user } = await requireAdmin();
  const { data, error } = await sb.from("newsletter_subscribers")
    .select("email,consented_at,consent_source,consent_version,consent_text,unsubscribe_token")
    .not("confirmed_at", "is", null)
    .is("unsubscribed_at", null)
    .neq("consent_version", "legacy-unverified")
    .order("consented_at", { ascending: true });
  if (error) return new Response("Kunde inte exportera prenumeranter. Kontrollera migration 0011 och 0012.", { status: 500 });

  const { error: auditError } = await sb.from("audit_logs").insert({ actor: user.id, action: "newsletter.exported", target: "newsletter_subscribers", meta: { active_count: data?.length ?? 0 } });
  if (auditError) console.error(`[newsletter] export audit log failed (${auditError.code})`);
  const rows = [
    ["email", "consented_at", "consent_source", "consent_version", "consent_text", "unsubscribe_url"],
    ...(data ?? []).map((row) => [row.email, row.consented_at, row.consent_source, row.consent_version, row.consent_text, `${SITE_URL}/nyhetsbrev/avregistrera/${row.unsubscribe_token}`]),
  ];
  const body = "\uFEFF" + rows.map((row) => row.map(csv).join(",")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="northern-stingers-newsletter.csv"',
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

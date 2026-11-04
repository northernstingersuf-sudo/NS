"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOrder } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Kunden klickar "Jag har betalat". Registrerar ENDAST en rapport (payments.reported_at) och skickar en Discord-notis.
 * Ändrar aldrig betalnings- eller orderstatus: det gör bara admin efter manuell kontroll.
 */
export async function reportPaid(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  if (!UUID.test(token)) redirect("/");
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!rateLimit(`report:${ip}`, 10, 10 * 60_000)) redirect(`/order/${token}?fel=1`);

  const sb = createAdminClient();
  const { data, error } = await sb.rpc("report_payment", { p_guest_token: token });
  if (error) {
    if (error.message.includes("order_not_found")) redirect("/");
    console.error(`[order] report_payment misslyckades (${error.code})`);
    redirect(`/order/${token}?fel=1`);
  }
  const r = data as { order_id: string; first_report: boolean };
  if (r.first_report) await notifyOrder(r.order_id, "payment_reported");
  redirect(`/order/${token}?rapporterad=1`);
}

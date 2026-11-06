import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildWithdrawalReceipt, isValidFrom, sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

export type WithdrawalReceiptResult = "sent" | "already_sent" | "not_configured" | "failed";

/** Skickar och loggar mottagningsbeviset. Kan köras om från admin med samma Resend-idempotensnyckel. */
export async function sendWithdrawalAcknowledgement(requestId: string): Promise<WithdrawalReceiptResult> {
  const sb = createAdminClient();
  const { data: row, error } = await sb.from("withdrawal_requests")
    .select("id,order_number,customer_name,customer_email,received_at,receipt_sent_at")
    .eq("id", requestId).maybeSingle();
  if (error || !row) return "failed";
  if (row.receipt_sent_at) return "already_sent";

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !isValidFrom(from)) {
    await sb.from("withdrawal_requests").update({ receipt_error: "not_configured" }).eq("id", requestId);
    return "not_configured";
  }

  const mail = buildWithdrawalReceipt({ orderNumber: row.order_number, customerName: row.customer_name, receivedAt: row.received_at, siteUrl: SITE_URL });
  const result = await sendEmail({
    apiKey, from, to: row.customer_email, ...mail,
    replyTo: process.env.EMAIL_REPLY_TO?.trim() || "info@northernstingers.store",
    idempotencyKey: `withdrawal:${requestId}:receipt`,
  });
  if (!result.ok) {
    await sb.from("withdrawal_requests").update({ receipt_error: result.error }).eq("id", requestId);
    return "failed";
  }
  const { error: updateError } = await sb.from("withdrawal_requests").update({ receipt_sent_at: new Date().toISOString(), receipt_error: null }).eq("id", requestId);
  if (updateError) console.error(`[withdrawal] kvittens skickad men loggning misslyckades (${updateError.code})`);
  return "sent";
}

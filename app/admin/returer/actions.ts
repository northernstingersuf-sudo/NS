"use server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { sendWithdrawalAcknowledgement } from "@/lib/withdrawals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const back = (kind: "ok" | "fel", message: string): never => redirect(`/admin/returer?${kind}=${encodeURIComponent(message)}`);

export async function markWithdrawalReviewed(formData: FormData) {
  const { sb, user } = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!UUID.test(id)) redirect("/admin/returer");
  const { error } = await sb.from("withdrawal_requests").update({ status: "reviewed" }).eq("id", id);
  if (error) back("fel", "Kunde inte uppdatera ärendet. Kontrollera migration 0011.");
  await sb.from("audit_logs").insert({ actor: user.id, action: "withdrawal.reviewed", target: id, meta: {} });
  back("ok", "Ärendet markerades som granskat.");
}

export async function retryWithdrawalReceipt(formData: FormData) {
  const { sb, user } = await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!UUID.test(id)) redirect("/admin/returer");
  const { data } = await sb.from("withdrawal_requests").select("id").eq("id", id).maybeSingle();
  if (!data) redirect("/admin/returer");
  const result = await sendWithdrawalAcknowledgement(id);
  await sb.from("audit_logs").insert({ actor: user.id, action: "withdrawal.receipt_retry", target: id, meta: { result } });
  if (result === "sent" || result === "already_sent") back("ok", "Mottagningsbeviset är skickat.");
  back("fel", result === "not_configured" ? "Resend eller avsändaradress saknas i miljövariablerna." : "Utskicket misslyckades. Kontrollera e-postinställningarna.");
}

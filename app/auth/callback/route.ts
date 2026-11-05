import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth-redirect";

const TYPES: EmailOtpType[] = ["signup", "magiclink", "recovery", "invite", "email_change", "email"];

/**
 * Tar emot länken från Supabases bekräftelsemejl.
 *  - PKCE: ?code=...  → byts mot en session.
 *  - Mallvariant: ?token_hash=...&type=... → verifieras med verifyOtp.
 * Vid fel skickas kunden till inloggningssidan med ett tydligt meddelande.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"));
  const sb = await createClient();

  let ok = false;
  if (code) {
    ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type && TYPES.includes(type)) {
    ok = !(await sb.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }
  return NextResponse.redirect(new URL(ok ? next : "/logga-in?fel=bekraftelse", url.origin));
}

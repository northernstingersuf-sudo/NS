import type { Metadata } from "next";
import Page from "@/components/Page";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmNewsletter } from "@/app/actions/newsletter";

export const metadata: Metadata = { title: "Bekräfta nyhetsbrev", robots: { index: false, follow: false } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ConfirmNewsletterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) return <Page title="Bekräfta nyhetsbrev"><p>Bekräftelselänken är ogiltig eller har gått ut.</p></Page>;
  try {
    const sb = createAdminClient();
    const { data, error } = await sb.from("newsletter_subscribers")
      .select("confirmed_at,unsubscribed_at").eq("confirmation_token", token).maybeSingle();
    if (error || !data) return <Page title="Bekräfta nyhetsbrev"><p>Länken är ogiltig eller har redan använts.</p></Page>;
    if (data.unsubscribed_at) return <Page title="Prenumerationen är inte aktiv"><p>Den här e-postadressen är avregistrerad.</p></Page>;
    if (data.confirmed_at) return <Page title="Prenumerationen är redan bekräftad"><p>Din e-postadress är redan bekräftad. Tack!</p></Page>;
  } catch {
    return <Page title="Bekräfta nyhetsbrev"><p>Bekräftelsen är tillfälligt otillgänglig. Försök igen senare.</p></Page>;
  }
  return <Page title="Bekräfta din e-postadress">
    <p>Bekräfta att du vill få nyheter och erbjudanden från Northern Stingers via e-post.</p>
    <form action={confirmNewsletter} className="mt-5 space-y-4">
      <input type="hidden" name="token" value={token} />
      <button type="submit" className="bg-ink px-5 py-3 text-sm text-paper">Bekräfta prenumeration</button>
    </form>
  </Page>;
}

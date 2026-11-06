import type { Metadata } from "next";
import Page from "@/components/Page";
import { createAdminClient } from "@/lib/supabase/admin";
import { unsubscribe } from "@/app/actions/newsletter";

export const metadata: Metadata = { title: "Avregistrera nyhetsbrev", robots: { index: false, follow: false } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) return <Page title="Avregistrera nyhetsbrev"><p>Länken är ogiltig eller har gått ut.</p></Page>;
  try {
    const sb = createAdminClient();
    const { data, error } = await sb.from("newsletter_subscribers").select("unsubscribed_at").eq("unsubscribe_token", token).maybeSingle();
    if (error || !data) return <Page title="Avregistrera nyhetsbrev"><p>Länken är ogiltig eller har redan tagits bort.</p></Page>;
    if (data.unsubscribed_at) return <Page title="Du är redan avregistrerad"><p>Den här e-postadressen får inte längre nyhetsbrev från Northern Stingers.</p></Page>;
  } catch {
    return <Page title="Avregistrera nyhetsbrev"><p>Avregistreringen är tillfälligt otillgänglig. Kontakta info@northernstingers.store.</p></Page>;
  }

  return (
    <Page title="Avregistrera nyhetsbrev">
      <p>Bekräfta att du vill sluta få nyheter och erbjudanden från Northern Stingers.</p>
      <form action={unsubscribe} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <button type="submit" className="bg-ink px-5 py-3 text-sm text-paper">Avregistrera mig</button>
      </form>
    </Page>
  );
}

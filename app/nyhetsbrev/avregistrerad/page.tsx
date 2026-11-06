import type { Metadata } from "next";
import Page from "@/components/Page";
export const metadata: Metadata = { title: "Nyhetsbrev avregistrerat", robots: { index: false, follow: false } };
export default async function Unsubscribed({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  if (status === "fel") return <Page title="Det gick inte att avregistrera"><p>Vi kunde inte behandla avregistreringen just nu. Kontakta <a href="mailto:info@northernstingers.store">info@northernstingers.store</a>.</p></Page>;
  if (status === "ogiltig") return <Page title="Länken är ogiltig"><p>Avregistreringslänken är ogiltig. Använd länken i nyhetsbrevet eller kontakta <a href="mailto:info@northernstingers.store">info@northernstingers.store</a>.</p></Page>;
  return <Page title="Du är avregistrerad"><p>Din e-postadress är avregistrerad från nyhetsbrevet och ska inte längre användas för utskick av nyheter eller erbjudanden.</p></Page>;
}

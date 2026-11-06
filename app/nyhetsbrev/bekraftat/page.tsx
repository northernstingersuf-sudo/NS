import type { Metadata } from "next";
import Page from "@/components/Page";

export const metadata: Metadata = { title: "Nyhetsbrev bekräftat", robots: { index: false, follow: false } };
export default async function NewsletterConfirmedPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  if (status === "fel") return <Page title="Bekräftelsen misslyckades"><p>Vi kunde inte aktivera prenumerationen just nu. Försök igen senare eller kontakta info@northernstingers.store.</p></Page>;
  if (status === "ogiltig") return <Page title="Länken är ogiltig"><p>Bekräftelselänken är ogiltig, har gått ut eller har redan använts.</p></Page>;
  return <Page title="Tack, din prenumeration är bekräftad"><p>Din e-postadress är bekräftad. Du kan när som helst avregistrera dig från nyhetsbrevet.</p></Page>;
}

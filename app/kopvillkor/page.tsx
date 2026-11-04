import type { Metadata } from "next";
import Page from "@/components/Page";
export const metadata: Metadata = { title: "Köpvillkor" };
export default function P() {
  return (<Page title="Köpvillkor"><p><strong>Utkast.</strong> Villkoren ska granskas och fastställas av Northern Stingers innan lansering.</p><h2>Betalning</h2><p>Betalning sker med Swish. Ordern bekräftas först när betalningen är verifierad.</p><h2>Priser</h2><p>Alla priser anges i svenska kronor inklusive moms.</p></Page>);
}

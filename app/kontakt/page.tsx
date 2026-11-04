import type { Metadata } from "next";
import Page from "@/components/Page";
export const metadata: Metadata = { title: "Kontakt" };
export default function P() {
  return (<Page title="Kontakt"><p>Frågor om en beställning eller en produkt? Skriv till <a href="mailto:info@northernstingers.store">info@northernstingers.store</a>.</p></Page>);
}

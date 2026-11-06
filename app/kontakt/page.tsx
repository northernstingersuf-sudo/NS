import type { Metadata } from "next";
import Page from "@/components/Page";
import BusinessDetails from "@/components/BusinessDetails";
import { businessDetails } from "@/lib/business";
export const metadata: Metadata = { title: "Kontakt" };
export default function ContactPage() {
  return (
    <Page title="Kontakt">
      <p>Frågor om en beställning, en produkt, retur eller reklamation? Kontakta oss via e-post.</p>
      <p><a href={`mailto:${businessDetails.email}`}>{businessDetails.email}</a></p>
      <h2>Företagsuppgifter</h2>
      <BusinessDetails />
    </Page>
  );
}

import type { Metadata } from "next";
import Page from "@/components/Page";
export const metadata: Metadata = { title: "Integritetspolicy" };
export default function P() {
  return (<Page title="Integritetspolicy"><p><strong>Utkast.</strong> Policyn ska granskas innan lansering.</p><h2>Vad vi sparar</h2><p>Uppgifter du lämnar vid köp och kontoskapande: namn, adress, e-post och orderhistorik. Vi använder dem för att leverera din order.</p><h2>Statistik</h2><p>Besöksstatistik samlas bara in efter ditt samtycke och är anonymiserad där det går.</p></Page>);
}

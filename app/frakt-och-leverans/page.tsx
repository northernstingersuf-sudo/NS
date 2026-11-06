import type { Metadata } from "next";
import Page from "@/components/Page";
import { businessDetails } from "@/lib/business";
export const metadata: Metadata = { title: "Frakt och leverans" };

export default function ShippingPage() {
  const estimate = process.env.PUBLIC_DELIVERY_ESTIMATE?.trim();
  return (
    <Page title="Frakt och leverans">
      <h2>Leveransområde</h2>
      <p>Vi levererar för närvarande endast till adresser i Sverige. Kontrollera att leveransuppgifterna är korrekta när du slutför köpet.</p>
      <h2>Fraktkostnad</h2>
      <p>Fraktkostnaden beräknas utifrån butikens aktuella fraktinställningar och visas i kassan innan du lägger beställningen. Eventuell gräns för fri frakt visas också i kassan. Du ser alltid orderns fraktkostnad och totalbelopp innan du bekräftar köpet.</p>
      <h2>Leveranstid</h2>
      {estimate ? <p>Beräknad leveranstid: {estimate}. Tiden är en uppskattning och kan påverkas av transportören eller omständigheter utanför vår kontroll. Om leveransen riskerar att bli försenad kontaktar vi dig.</p> : <p>Den aktuella beräknade leveranstiden är ännu inte publicerad. Kassan hålls därför stängd tills en verklig leveranstidsuppskattning har fastställts. Kontakta <a href={`mailto:${businessDetails.email}`}>{businessDetails.email}</a> om du har frågor.</p>}
      <h2>Orderhantering och spårning</h2>
      <p>Vi börjar behandla ordern när Swish-betalningen har verifierats manuellt. När ordern har skickats får du ett spårningsnummer om transportören erbjuder spårning. Kontrollera även skräpposten om du väntar på ett mejl från oss.</p>
      <h2>Felaktig eller skadad leverans</h2>
      <p>Kontakta oss så snart som möjligt om paketet saknas, är skadat eller innehåller fel vara. Bifoga ordernummer och gärna bilder på skadan eller innehållet. Dina lagstadgade reklamationsrättigheter påverkas inte.</p>
    </Page>
  );
}

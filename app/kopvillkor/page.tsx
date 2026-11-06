import type { Metadata } from "next";
import Page from "@/components/Page";
import BusinessDetails from "@/components/BusinessDetails";
import { businessDetails } from "@/lib/business";

export const metadata: Metadata = { title: "Köpvillkor" };
export default function PurchaseTerms() {
  return (
    <Page title="Köpvillkor">
      <p>Villkoren gäller när du som konsument handlar varor från Northern Stingers via webbplatsen. Tvingande konsumentlagstiftning gäller alltid framför villkor som ger dig sämre rättigheter.</p>

      <h2>Säljare och kontaktuppgifter</h2>
      <BusinessDetails />
      <p>Frågor om köp: <a href={`mailto:${businessDetails.email}`}>{businessDetails.email}</a>.</p>

      <h2>Beställning och avtal</h2>
      <p>Du kan handla som gäst; kundkonto är frivilligt. Kontrollera varor, varianter, antal, leveransuppgifter, frakt och totalbelopp innan du slutför beställningen. När du skickar beställningen åtar du dig att betala det totalbelopp som visas i kassan. En orderbekräftelse skickas till den e-postadress du anger när e-posttjänsten är tillgänglig.</p>
      <p>Ordern registreras med ett ordernummer. Eftersom betalning sker manuellt med Swish behandlas ordern först när vi har kontrollerat att rätt belopp har kommit in. Att Swish öppnas eller att du trycker på ”Jag har betalat” är inte en betalningsbekräftelse. Om vi inte kan acceptera eller leverera en beställning kontaktar vi dig och hanterar eventuell återbetalning.</p>

      <h2>Produkter, priser och betalning</h2>
      <p>Produktinformation, tillgängliga varianter och priser visas på respektive produktsida. Alla belopp anges i svenska kronor (SEK). Priset som visas för konsumenten är totalpriset inklusive eventuella skatter. Frakt och eventuella rabatter visas separat innan du slutför köpet. Det slutliga beloppet räknas ut på servern och framgår av ordern.</p>
      <p>Betalning sker med Swish till det nummer och med den orderreferens som visas efter beställningen. Du ansvarar för att ange korrekt belopp och referens. Vi markerar inte en order som betald förrän betalningen har kontrollerats manuellt. Systemet lagrar inte dina Swish-inloggningsuppgifter eller kortuppgifter.</p>

      <h2>Leverans</h2>
      <p>Vi levererar för närvarande inom Sverige. Fraktkostnaden visas i kassan innan du beställer. Beräknad leveranstid och eventuella leveransbegränsningar ska anges i leveransinformationen och i kassan innan köp. Läs mer på <a href="/frakt-och-leverans">Frakt och leverans</a>.</p>

      <h2>Ångerrätt och retur</h2>
      <p>Vid distansköp har du som huvudregel 14 dagars ångerrätt. Fristen börjar dagen efter att du tagit emot varan. Du behöver inte ange något skäl. För att använda ångerrätten kan du skicka in formuläret på sidan <a href="/retur-och-reklamation">Retur och reklamation</a> eller lämna ett annat tydligt meddelande till oss inom ångerfristen.</p>
      <p>Om du ångrar köpet ska varan skickas tillbaka utan onödigt dröjsmål och senast inom 14 dagar från att du meddelade oss. Du står för den direkta returfrakten, under förutsättning att du har fått information om detta före köpet. Du får undersöka varan så långt det behövs för att bedöma dess egenskaper och funktion. Du kan bli ansvarig för värdeminskning som beror på hantering utöver vad som varit nödvändigt.</p>
      <p>Vi återbetalar utan onödigt dröjsmål och senast inom 14 dagar från att vi tagit emot ditt ångermeddelande. Vid köp av varor får vi avvakta med återbetalningen tills vi fått tillbaka varan eller du visat att den skickats tillbaka. Återbetalning görs med samma betalningssätt, om du inte uttryckligen godkänner något annat.</p>

      <h2>Reklamation och garanti</h2>
      <p>Du har enligt konsumentköplagen rätt att reklamera ursprungliga fel i upp till tre år från att du tog emot varan. Du bör reklamera inom två månader från att du upptäckte felet. Kontakta oss med ordernummer, beskrivning av felet och gärna bilder. En reklamation som godkänns ska hanteras utan kostnad för dig enligt konsumentköplagen.</p>
      <p>En eventuell garanti är frivillig och påverkar inte dina lagstadgade rättigheter.</p>

      <h2>Avbeställning, fel och tvist</h2>
      <p>Du har rätt att avbeställa en vara innan den har levererats. Om vi redan har haft särskilda kostnader kan ersättning i vissa fall bli aktuell enligt konsumentköplagen. Kontakta oss så snart som möjligt.</p>
      <p>Om vi inte kommer överens kan du vända dig till Allmänna reklamationsnämnden (ARN) för prövning när ärendet uppfyller nämndens krav. Information finns på <a href="https://www.arn.se/">arn.se</a>. Du kan även få vägledning via <a href="https://www.konsumentverket.se/">Konsumentverket</a>. Svensk lag tillämpas, utan att begränsa tvingande konsumentskydd i det land där du bor.</p>

      <h2>Kontakt</h2>
      <p>Kontakta <a href={`mailto:${businessDetails.email}`}>{businessDetails.email}</a> vid frågor om villkoren eller din beställning.</p>
      <p className="text-xs">Senast uppdaterad: 6 november 2026.</p>
    </Page>
  );
}

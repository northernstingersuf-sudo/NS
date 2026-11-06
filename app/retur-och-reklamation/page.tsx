import type { Metadata } from "next";
import Page from "@/components/Page";
import WithdrawalRequestForm from "@/components/WithdrawalRequestForm";
import { businessDetails } from "@/lib/business";
export const metadata: Metadata = { title: "Retur och reklamation" };

export default function ReturnsPage() {
  return (
    <Page title="Retur och reklamation">
      <h2>Ångerrätt – 14 dagar</h2>
      <p>När du handlar på distans har du som konsument som huvudregel 14 dagars ångerrätt. För varor räknas tiden från dagen efter att du tagit emot varan. Du behöver inte ange något skäl för att ångra köpet.</p>
      <p>Du kan använda formuläret nedan för att skicka ett uttryckligt ångermeddelande. Funktionen finns tillgänglig på webbplatsen och ett mottagningsbevis skickas till orderns e-postadress. Du kan också kontakta oss på <a href={`mailto:${businessDetails.email}`}>{businessDetails.email}</a> eller skicka ett annat tydligt meddelande inom ångerfristen.</p>
      <WithdrawalRequestForm />

      <h2>Så skickar du tillbaka varan</h2>
      <p>Efter att du meddelat oss att du ångrar köpet ska varan skickas tillbaka utan onödigt dröjsmål och senast inom 14 dagar. {businessDetails.returnAddress ? <>Skicka returen till: {businessDetails.returnAddress}. Kontakta oss först om du behöver instruktioner.</> : <>Kontakta oss innan du skickar returen så att vi kan ge dig en aktuell returadress och instruktioner. En returadress får inte gissas eller skickas till en adress som inte har bekräftats av oss.</>}</p>
      <p>Du står för den direkta returfrakten vid ångrat köp. Du får undersöka varan för att fastställa dess egenskaper och funktion. Om du hanterar den mer än vad som är nödvändigt kan du bli ansvarig för eventuell värdeminskning.</p>

      <h2>Återbetalning</h2>
      <p>Vi återbetalar utan onödigt dröjsmål och senast inom 14 dagar från den dag vi tog emot ditt ångermeddelande. Vid varuköp kan vi vänta med återbetalningen tills vi har fått tillbaka varan eller du har visat att den skickats tillbaka. Återbetalning sker med samma betalningssätt som användes vid köpet, om du inte uttryckligen godkänner något annat. Swish-återbetalningar hanteras manuellt.</p>

      <h2>Reklamation – fel på vara</h2>
      <p>Du har tre års reklamationsrätt enligt konsumentköplagen för ursprungliga fel. Reklamera inom skälig tid efter att du upptäckt felet; en reklamation som görs inom två månader från upptäckten anses alltid ha gjorts i rätt tid. Beskriv felet, ange ordernummer och bifoga gärna bilder.</p>
      <p>Om reklamationen godkänns åtgärdar vi felet enligt konsumentköplagen, exempelvis genom reparation, omleverans, prisavdrag eller hävning beroende på omständigheterna. En godkänd reklamation ska inte medföra kostnader för dig.</p>

      <h2>Standardformulär för ångerrätt</h2>
      <p>Du kan använda följande text om du inte vill använda formuläret ovan:</p>
      <blockquote className="border-l-2 border-line pl-4 text-sm">
        <p>Till Northern Stingers, {businessDetails.email}.</p>
        <p>Jag meddelar härmed att jag frånträder mitt köpeavtal avseende följande vara/varor:</p>
        <p>Ordernummer och datum:</p>
        <p>Namn:</p>
        <p>Adress:</p>
        <p>Datum:</p>
      </blockquote>
      <p>Detta är en standardtext som du kan kopiera och skicka till oss. Ett tydligt meddelande i annan form fungerar också.</p>
    </Page>
  );
}

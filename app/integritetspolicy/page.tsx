import type { Metadata } from "next";
import Page from "@/components/Page";
import BusinessDetails from "@/components/BusinessDetails";
import { businessDetails } from "@/lib/business";

export const metadata: Metadata = { title: "Integritetspolicy" };
export default function PrivacyPolicy() {
  return (
    <Page title="Integritetspolicy">
      <p>Den här policyn beskriver hur Northern Stingers behandlar personuppgifter när du besöker webbplatsen, handlar, skapar ett konto, kontaktar oss eller anmäler dig till nyhetsbrevet. Vi behandlar bara uppgifter som behövs för de angivna ändamålen och säljer inte personuppgifter.</p>

      <h2>Personuppgiftsansvarig och kontakt</h2>
      <BusinessDetails />
      <p>Kontakta <a href={`mailto:${businessDetails.email}`}>{businessDetails.email}</a> vid frågor om personuppgifter eller för att utöva dina rättigheter.</p>

      <h2>Vilka uppgifter vi behandlar och varför</h2>
      <p><strong>Beställningar och betalning:</strong> namn, e-postadress, leveransadress, eventuell telefon, orderinnehåll, priser, ordernummer och betalnings-/leveransstatus. Uppgifterna behövs för att ta emot, administrera och leverera köpet, hantera kundservice och uppfylla bokförings- och andra rättsliga skyldigheter. Rättslig grund är i första hand avtal och, för uppgifter som måste sparas enligt lag, rättslig förpliktelse.</p>
      <p><strong>Kundkonto:</strong> kontots identifierare, e-postadress, namn, telefon där du lämnar den, språkval, orderhistorik och önskelista. Uppgifterna används för att tillhandahålla kontot och de funktioner du använder. Rättslig grund är avtal. Du kan kontakta oss om du vill avsluta kontot; uppgifter som måste bevaras enligt lag kan inte raderas förrän skyldigheten upphört.</p>
      <p><strong>Nyhetsbrev:</strong> e-postadress, tidpunkt och text för samtycke, anmälningskälla, bekräftelsetidpunkt, slumpmässiga bekräftelse- och avregistreringstoken samt avregistreringstidpunkt. Vi skickar ett bekräftelsemejl och aktiverar inte prenumerationen förrän du klickat dig vidare och bekräftat. Uppgifterna används endast för att administrera prenumerationen och dokumentera samtycke eller återkallelse. Rättslig grund är samtycke. Du kan när som helst avregistrera dig via länken i ett nyhetsbrev eller kontakta oss.</p>
      <p><strong>Kundservice, reklamationer och ångermeddelanden:</strong> de uppgifter du själv lämnar, ordernummer, orderns kontaktuppgifter, meddelandet och tidpunkten då ärendet kom in samt status för mottagningsbevis. Uppgifterna används för att ta emot, bekräfta och hantera ärendet och för att kunna visa när ett ångermeddelande kom in. Rättslig grund är avtal, rättslig förpliktelse eller, när det är lämpligt, vårt berättigade intresse av att hantera och dokumentera kundärenden.</p>
      <p><strong>Teknisk och nödvändig lagring:</strong> webbplatsen använder nödvändig sessionshantering för inloggning samt lokal lagring i webbläsaren för varukorgen och en tillfällig kassanyckel som motverkar dubbla beställningar. Se <a href="/cookies">cookieinformationen</a>.</p>

      <h2>Vilka som kan få del av uppgifterna</h2>
      <p>Uppgifter delas bara när det behövs för att driva butiken. Leverantörer som kan behandla uppgifter för vår räkning är bland annat Supabase (databas, inloggning och fillagring), Vercel (drift av webbplatsen), Resend (transaktionsmejl, när e-posttjänsten är aktiverad) och Discord (orderaviseringar till butikens privata kanal). Fraktuppgifter lämnas till det fraktbolag som behövs för leveransen.</p>
      <p>För orderadministration kan ordernummer, produkter, belopp och betalningsstatus skickas till Discord. Vi skickar som standard inte kundens e-postadress, telefonnummer eller fullständiga leveransadress dit. Discord är en extern tjänst och behandlingen omfattas även av Discords villkor och integritetsinformation. Betalning hanteras av kunden i Swish och kontrolleras manuellt av oss; webbplatsen får inte automatiskt en betalningsbekräftelse från Swish.</p>
      <p>Leverantörerna kan agera som personuppgiftsbiträden eller självständigt personuppgiftsansvariga beroende på tjänst och behandling. Vi ska ha relevanta personuppgiftsbiträdesavtal när det krävs och kontrollera var uppgifterna behandlas. Om uppgifter överförs utanför EU/EES ska överföringen ha stöd i GDPR, exempelvis ett giltigt adekvansbeslut eller lämpliga skyddsåtgärder. Kontrollera respektive leverantörs aktuella villkor och datalokaliseringsinställningar.</p>

      <h2>Hur länge uppgifterna sparas</h2>
      <p>Order- och betalningsunderlag som utgör räkenskapsinformation sparas så länge bokföringsreglerna kräver det. Räkenskapsinformation ska normalt bevaras till och med det sjunde året efter utgången av det kalenderår då räkenskapsåret avslutades. Andra orderuppgifter sparas inte längre än vad som behövs för kundservice, reklamationer och rättsliga anspråk.</p>
      <p>Kontouppgifter sparas så länge kontot är aktivt och därefter bara när det finns ett berättigat eller rättsligt behov. Nyhetsbrevsuppgifter används tills du avregistrerar dig. Efter avregistrering begränsas behandlingen till de uppgifter som behövs för att respektera spärren och undvika framtida utskick av misstag; uppgifterna ska gallras när de inte längre behövs. Kundservice- och ångerärenden sparas så länge det behövs för handläggning och för att uppfylla tillämpliga rättsliga krav.</p>

      <h2>Dina rättigheter</h2>
      <p>Du kan begära tillgång till dina personuppgifter, rättelse av felaktiga uppgifter, radering när förutsättningarna finns, begränsning av behandling och dataportabilitet när reglerna ger rätt till det. Du kan invända mot behandling som grundas på intresseavvägning och återkalla ett samtycke när som helst. Ett återkallat samtycke påverkar inte behandling som redan skett lagligt.</p>
      <p>Kontakta oss på <a href={`mailto:${businessDetails.email}`}>{businessDetails.email}</a>. Vi kan behöva kontrollera din identitet innan vi lämnar ut eller ändrar uppgifter. Du har också rätt att lämna klagomål till Integritetsskyddsmyndigheten (IMY), <a href="https://www.imy.se/">imy.se</a>.</p>

      <h2>Cookies och liknande teknik</h2>
      <p>Vi använder nödvändig sessionshantering och webbläsarlagring för funktioner som du själv begär, till exempel varukorg och inloggning. I den nuvarande kodbasen är ingen icke-nödvändig analys- eller marknadsföringsspårning aktiverad. Läs mer på sidan <a href="/cookies">Cookies</a>. Om vi inför statistik eller marknadsföringsverktyg ska information och samtycke hanteras innan sådan teknik aktiveras.</p>

      <h2>Ändringar</h2>
      <p>Vi kan uppdatera policyn när webbplatsens funktioner eller regler ändras. Den senast publicerade versionen finns alltid på den här sidan. Datum för senaste uppdatering: 6 november 2026.</p>
    </Page>
  );
}

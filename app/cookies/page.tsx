import type { Metadata } from "next";
import Page from "@/components/Page";
import { businessDetails } from "@/lib/business";

export const metadata: Metadata = { title: "Cookies och lokal lagring" };

export default function CookiesPage() {
  return (
    <Page title="Cookies och lokal lagring">
      <p>Den här sidan beskriver cookies och liknande teknik som används av Northern Stingers webbplats.</p>
      <h2>Nödvändiga funktioner</h2>
      <p>Inloggning och kontosessioner använder nödvändig sessionshantering via Supabase. Webbplatsen använder även webbläsarens lokala lagring för att komma ihåg varukorgens innehåll och tillfällig sessionslagring för en kassanyckel som hjälper till att förhindra dubbla beställningar. Dessa funktioner behövs för tjänster som du själv begär, till exempel varukorg, konto och kassa.</p>
      <h2>Analys och marknadsföring</h2>
      <p>I den kodbas som används för denna version är ingen icke-nödvändig analys- eller marknadsföringsspårning aktiverad. Vi ska inte lagra eller läsa information för sådana ändamål innan du har fått tydlig information och lämnat ett giltigt, aktivt samtycke där det krävs.</p>
      <h2>Ändra eller återkalla samtycke</h2>
      <p>Om vi senare inför statistik- eller marknadsföringsverktyg ska webbplatsen få en samtyckesfunktion där du kan välja ändamål och lika enkelt återkalla eller ändra ditt val. Eventuella ändringar i tekniken ska återspeglas på den här sidan och i integritetspolicyn.</p>
      <h2>Kontakt</h2>
      <p>Frågor om lagring och personuppgifter? Läs <a href="/integritetspolicy">integritetspolicyn</a> eller kontakta <a href={`mailto:${businessDetails.email}`}>{businessDetails.email}</a>.</p>
      <p className="text-xs">Senast uppdaterad: 6 november 2026.</p>
    </Page>
  );
}

# Implementation status – v12, 6 november 2026

Se även `CHANGELOG.md` för vad som lagts till i vilken version.

## Basfunktioner från v11 (steg 4–7 i utvecklingsbriefen)

- **Migrationerna `0006`–`0010`** (ändrar inga tidigare migrationer):
  - Rättar att `product_images.variant_id` saknades. Katalogfrågan och produktsidan läste kolumnen, så frågan gav fel och katalogen blev tom.
  - Order: ordernummer `NS-ÅÅÅÅ-NNNNNN`, idempotensnyckel, unik gästtoken, locale, rabattkod.
  - Betalning: `reported_at` (kundrapport), `verified_at/by/amount` (manuell verifiering).
  - Nya tabeller: `shop_settings`, `order_events`, `notification_log`, `stock_adjustments` (alla med RLS, endast admin).
  - `create_order` (service role): serverprissättning, rabatt, frakt, lagerreservation med radlås, idempotens, allt i en transaktion.
  - `report_payment`, `claim_notification`, `finish_notification` (service role).
  - `admin_verify_payment`, `admin_update_order`, `admin_register_refund`, `admin_adjust_stock` (SECURITY INVOKER + `is_admin()`).
  - `admin_save_product` bevarar nu variant-ID:n (tidigare raderades varianter vid varje sparning).
- **Kassa** `/kassa`: gästköp, servern räknar allt. Stängd tills fraktpris, Swish-nummer och service role är konfigurerade. Idempotensnyckel per korg+formulär. Honeypot och best-effort rate limit.
- **Orderstatus/betalning** `/order/[token]`: lokalt genererad Swish-QR (`qrcode`, inga anrop till Swish), appknapp (best-effort, mobil), nummer/belopp/referens med kopiera, "Jag har betalat" (rapporterar bara). "Betald" visas endast när admin verifierat.
- **Discord**: fyra notiser (ny order, kund rapporterat betalning, betalning verifierad, order skickad; migrationerna `0007` och `0008`). Webhook från servern, riktig rollmention + `allowed_mentions`, ingen persondata, dedupe och retry via `notification_log`, fel stoppar aldrig ordern.
- **Admin**: Beställningar (sök/status/datum), orderdetalj (verifiera betalning med beloppskontroll, statusflöde, spårning, administrativ återbetalning, händelsehistorik, Discord-status + "försök igen"), Lager (loggad justering), Inställningar (frakt + driftkontroll utan att visa hemligheter), dashboard med riktiga värden.

## Historisk verifiering för v11-baslinjen

- `npm run typecheck`: OK. `npm test`: 30/30 (Swish-format, Discord-payload, kassavalidering). `next build`: OK (med Google Fonts ersatt tillfälligt, eftersom byggmiljön saknade internet mot Google; ingen kodändring kvar).
- Databastest `supabase/tests/orders_flow.test.sql` mot tom lokal PostgreSQL 16 efter 0001–0006: alla kontroller gick igenom, bl.a. serverpris, idempotens, ingen överförsäljning, avbokning frigör lager/rabatt, kunder ser bara egna order, anon/kund kan inte anropa kundfunktioner eller adminfunktioner, kundrapport ändrar inte betalstatus, dubbelverifiering och fel belopp nekas, notisdedupe/retry, variant-ID bevaras.
- Samtidighet med riktiga parallella sessioner: 8 samtidiga köp mot saldo 3 gav exakt 3 order (reserverat 3/3). 6 samtidiga anrop med samma nyckel gav 1 order och 1 reservation.

## Bekräftat av ägaren i produktion

- Statusknapparna i admin (packad, skickad, avbruten) fungerar efter v9 (bekräftat efter att rätt version deployats).
- Order kan läggas och hanteras i admin.

Inte uttryckligen bekräftat ännu: Swish-QR i telefon, Discord-notiserna mot din riktiga webhook, lagerreservation i skarp miljö.

## Fortfarande ej verifierat mot ägarens produktionsmiljö

- Supabase-projektet i produktion (migrationer, PostgREST-schemacache, att rollen `service_role` har EXECUTE på funktionerna).
- Själva appen mot en riktig Supabase: anropen `rpc(...)` och sidorna har typkontrollerats och byggts men inte körts mot en databas.
- **Swish i telefon.** Formatdetaljerna är hämtade från briefen och sekundära källor, inte från Swish specifikation: decimalkomma i beloppet och sista fältets (`lock_mask = 0`) betydelse. Skanna QR med Swish-appen på iOS och Android och kontrollera mottagare, belopp, referens. Justera i `lib/swish.ts` vid avvikelse. Appknappens länkformat är inofficiellt.
- Discord: kräver riktig webhook, roll-ID och rätt att pinga rollen.
- **E-post:** kräver Resend-konto, verifierad domän (SPF/DKIM) och API-nyckel. Utskicket är testat mot en fejkad Resend, inte mot den riktiga tjänsten. Kontrollera även att mejlen inte hamnar i skräppost och hur de ser ut i Gmail/Outlook/mobil.
- Mobil/tillgänglighet, bildhantering och prestanda.

## Kända begränsningar

- Lager spåras per produkt, inte per variant. Variantens `in_stock`-flagga styr tillgänglighet.
- Order som skapades innan lagerspårning startade påverkar inte saldot.
- Obetalda order håller reservation tills admin avbokar (ingen automatisk utgång).
- Rate limiting är per serverinstans (in-memory). Komplettera med hostingens regler.
- E-post: bara tre transaktionsmejl. Inget mejl vid avbruten order eller återbetalning, och inget nytt mejl om kunden ändrar e-postadress. Mejlet bekräftar aldrig betalning innan admin verifierat.
- Frakt är ett fast pris med valfri fri-fraktgräns, endast Sverige.

## Återstående arbete efter v12

- Bildhantering i admin via Supabase Storage, kategorihantering, kundöversikt, rabattkodernas admin-UI och recensionsmoderering.
- Fullständigt engelskt innehåll genom hela köpresan, inklusive juridiska sidor och ångerflöde.
- Utskick av nyhetsbrevskampanjer. v12 hanterar samtycke, prenumerantadministration, avregistrering och CSV-export men skickar inte kampanjer.
- Överväg dubbel opt-in och bygg en verifieringsprocess om den behövs för butikens risknivå och val av e-postleverantör.
- Mejlfunktioner vid avbokning/återbetalning och hantering av ändrad kund-e-post.
- Admin-MFA, strikt CSP, distribuerad rate limiting, samtyckesstyrd analys/statistik samt dokumenterat och testat backup-/återställningsflöde.
- Kundkontots orderhistorik behöver testas och kompletteras med en tydlig, säker orderstatuslänk där det saknas.
- Tillgänglighet, mobiltest, bildoptimering och prestanda behöver verifieras före lansering.
- Statusflödet tillåter betald → skickad utan packa-steg (migration 0009). Om packning ska vara obligatoriskt behöver övergången i `admin_update_order` ändras och testas.


## Tillägg v12 – nyhetsbrev, konsumentinformation och ångermeddelanden (6 november 2026)

### Implementerat i koden

- **Nyhetsbrev:** separat, omarkerad samtyckesruta; e-post normaliseras; servervalidering, honeypot och enkel rate limit; server-side skrivning via service role. Den exakta samtyckestexten, versionen, källan och tidpunkten sparas. Ny prenumeration återaktiverar en tidigare avregistrerad adress med ett nytt samtycke.
- **Avregistrering:** unik slumpmässig token, separat bekräftelsesida och POST-baserad avregistrering. GET-länkar ändrar inte abonnemangsstatus. Avregistrerade adresser ingår inte i exporten.
- **Admin → Nyhetsbrev:** prenumerantlista, status, samtyckestid, källa/version och samtyckestext. CSV-exporten loggas i `audit_logs`, innehåller aktiva adresser med aktuell dokumenterad samtyckesversion och per-mottagare-avregistreringslänk, samt exkluderar gamla poster vars samtycke inte kunde styrkas med lagrad text. Exportfilen innehåller personliga avregistreringstoken i URL-format och ska skyddas som personuppgifter.
- **Ångerrätt online:** sidan `/retur-och-reklamation` har ett öppet formulär med ordernummer, orderns namn/e-post och uttrycklig ångerbekräftelse. Mottagningsbevis skickas automatiskt via e-post utan en separat valfri kryssruta. Mottagningsbeviset innehåller ordernummer och mottagningstid i svensk tid.
- **Admin → Ångermeddelanden:** inkomna ärenden, status, mottagningstid, kvittensstatus samt möjlighet att försöka skicka kvittensen igen. Ärende och återbetalning hålls separata; formuläret gör ingen automatisk återbetalning.
- **Juridiska infosidor:** utökade sidor för köpvillkor, integritetspolicy, frakt/leverans, retur/reklamation och cookies. Företagsuppgifter hämtas från serverns miljövariabler och saknade värden visas öppet i stället för att hittas på.
- **Kassa:** köpknappen använder formuleringen ”Slutför köp – betalningsskyldighet”. Kunder länkas direkt till köpvillkor, fraktinformation och ångerrätt före beställning. Kassan hålls stängd tills obligatoriska säljaruppgifter, verklig leveranstidsuppskattning och fungerande Resend-konfiguration finns.
- **Domän:** `.store` används som kanonisk adress i metadata, sitemap, robots, footer och tester. Sätt `NEXT_PUBLIC_SITE_URL=https://northernstingers.store` i produktionsmiljön.

### Databas och driftsättning

1. Ta backup och kontrollera att projektet pekar mot rätt Supabase-projekt.
2. Kör `supabase/migrations/0011_newsletter_withdrawal.sql` efter 0010. Migrationen lägger till samtyckesmetadata/avregistreringstoken och skapar `withdrawal_requests` med RLS.
3. Kontrollera att `SUPABASE_SERVICE_ROLE_KEY` är korrekt och endast server-side.
4. Konfigurera Resend med verifierad sändardomän, `RESEND_API_KEY`, `EMAIL_FROM` och vid behov `EMAIL_REPLY_TO`. Kassan hålls stängd tills detta är konfigurerat. Mottagningsbevis för ångermeddelanden måste testas i riktig inkorg före lansering.
5. Lägg in korrekta publika säljaruppgifter och leveranstidsuppskattning enligt `.env.example`.
6. Kör typecheck, enhetstester och build. Testa sedan i ett separat Supabase-projekt och testa e-post i riktig inkorg.

### Viktiga begränsningar – före produktionslansering

- **Företagsuppgifter är inte kända i underlaget.** Fyll i juridiskt företagsnamn, organisationsnummer, fullständig postadress, telefonnummer och momsregistreringsnummer om tillämpligt. Säljaren måste identifieras tydligt innan köp. Inga uppgifter får hittas på.
- **Leveranstiden är inte angiven.** Sätt `PUBLIC_DELIVERY_ESTIMATE` till en verklig och realistisk uppskattning och kontrollera att fraktpris, eventuell fri-fraktgräns och leveransområde stämmer mot butikens inställningar.
- **Returadress saknas.** Den lämnas till kunden efter att ångermeddelande tagits emot. Fastställ en fungerande returadress och rutin innan lansering. Returfrakt får endast läggas på kunden när kunden har informerats om detta före köpet.
- **Juridisk slutgranskning krävs.** Texterna är operativa utkast och inte en garanti för full regelefterlevnad. Ägaren behöver kontrollera faktisk affärsmodell, momshantering, leveransvillkor, personuppgiftsbiträdesavtal, lagringstider och eventuella undantag från ångerrätten.
- **Ångerkvittens kräver fungerande e-post.** Om Resend saknas eller skickandet misslyckas sparas ärendet och visas i admin, men kunden måste kontaktas och kvittensen skickas omgående. Funktionen är inte produktionsverifierad mot en riktig e-posttjänst.
- **Nyhetsbrevskampanjer ingår inte.** Denna version hanterar registrering, dokumentation, avregistrering, administrativ lista och CSV-export med unik avregistreringslänk per mottagare. Den skickar inte marknadsföringskampanjer. Koppla en utskickstjänst först efter att personuppgiftsbiträdesvillkor, mottagarimport, avregistreringslänkar och testutskick är verifierade. Exporterade `legacy-unverified`-poster exkluderas avsiktligt.
- **Dubbel opt-in är inte implementerad.** Samtycke ges via en aktiv checkbox och sparas med exakt text. En verifieringsmejlprocess kan läggas till om ägaren vill ha ytterligare skydd mot felaktiga adresser.
- **Engelska juridiska sidor och hela köpresan är inte färdigställda.** De nya juridiska sidorna är svenska. Briefens krav på fullständig svenska/engelska återstår.
- **Ingen icke-nödvändig analys eller cookie-banner är implementerad.** I denna kodversion används endast nödvändig sessionshantering, varukorgens lokala lagring och kassans session-nyckel. Om analys/marknadsföringscookies införs måste ett samtyckesgränssnitt och återkallande byggas innan de aktiveras.
- **Rate limit är fortfarande per serverinstans i minnet.** Det är ett enklare skydd, inte ett fullständigt distribuerat bot-/missbruksskydd.

### Teststatus i den här arbetsmiljön

- Transpilering/syntaxkontroll för 86 TypeScript/TSX-filer: godkänd.
- Isolerade e-posttester: 9/9 godkända.
- Full `npm run typecheck`, `npm test` och `npm run build` kunde inte verifieras här eftersom npm-paket saknades och paketregistret inte var tillgängligt. `npm ci` kunde inte slutföras, och offlineinstallationen saknade ett beroendearkiv.
- Migration `0011_newsletter_withdrawal.sql` är skapad men har inte körts mot ägarens Supabase-projekt. Kör den först i ett separat testprojekt.
- Riktig leverans via Resend, e-postkvittens i inkorg, Swish på iOS/Android och Discord-webhook är inte live-testade i denna miljö.

### Acceptanstester för v12

- Nyhetsbrev: samtycke krävs och är omarkerat från början; validera dubbla registreringar, reaktivering, avregistreringslänk, GET utan sidoeffekt, POST som avregistrerar och att avregistrerade/legacy-poster inte kommer med i CSV.
- Ångerrätt: giltigt ordernummer + exakt ordernamn + orderns e-post krävs; uttrycklig ångerbekräftelse krävs; kvittens ska innehålla ordernummer och faktisk mottagningstid; admin kan se ärendet och skicka om kvittensen.
- Kassa: köpknappen och länkarna till villkor/ångerrätt/frakt visas före köp; slutbeloppet kommer från servern.
- Juridik: granska alla företagsuppgifter, faktisk leveranstid/frakt/returadress, språk och dataskyddsprocess före publicering.



## Tillägg v12.1 – dubbel bekräftelse av nyhetsbrev (6 november 2026)
- Nyhetsbrevsanmälan skickar ett bekräftelsemejl via Resend. Prenumerationen aktiveras först efter att mottagaren öppnat länken och tryckt på bekräftelseknappen.
- Admin och CSV-export räknar endast bekräftade och ej avregistrerade adresser som aktiva. Äldre poster måste bekräftas innan de kan exporteras för marknadsföring.
- Ny migration: `0012_newsletter_double_opt_in.sql`. Denna kodändring är inte verifierad mot ett riktigt Supabase-projekt eller en riktig Resend-inkorg; kör migrationen först i testmiljö och testa sedan utskicket.

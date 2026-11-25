# Northern Stingers – webshop

Next.js App Router, React, TypeScript, Tailwind CSS och Supabase. Projektet utvecklas vidare från den befintliga kodbasen; funktioner som ännu inte är färdigbyggda beskrivs längst ned.

## Kom igång

1. Installera Node.js 20 eller senare.
2. Kör `npm ci`.
3. Kopiera `.env.example` till `.env.local` och fyll i Supabase URL och publishable key.
4. Kör samtliga SQL-migrationer i `supabase/migrations` i nummerordning i Supabase SQL Editor:
   - `0001_init.sql`
   - `0002_seed.sql`
   - `0003_variants.sql`
   - `0004_seed_products.sql`
   - `0005_catalog_admin.sql`
   - `0006_orders_checkout.sql`
   - `0007_notify_payment_verified.sql`
   - `0008_notify_order_shipped.sql`
   - `0009_ship_without_packing.sql`
   - `0010_email_log.sql`
   - `0011_newsletter_withdrawal.sql`
   - `0012_newsletter_double_opt_in.sql`
   - `0013_checkout_total_guard.sql`
   - `0014_sprint02_operations.sql`
   - `20261125180652_variant_inventory_and_images.sql`
5. Starta utvecklingsservern med `npm run dev`.
6. Skapa ett konto via `/logga-in`. Ge sedan kontot adminroll från Supabase SQL Editor:
   ```sql
   update public.profiles
   set role = 'admin'
   where id = '<Ditt auth.users-id>';
   ```
7. Sätt miljövariabler (se `.env.example`) i hostingen, främst `SUPABASE_SERVICE_ROLE_KEY`, `SWISH_NUMBER`, `DISCORD_WEBHOOK_URL`, `DISCORD_ROLE_ID` och säljar-/leveransuppgifterna. Kassan hålls stängd tills juridiskt företagsnamn, organisationsnummer, adress, telefon, verklig leveranstidsuppskattning och fungerande Resend-konfiguration är ifyllda. Returadress anges med `BUSINESS_RETURN_ADDRESS` eller lämnas av kundservice innan en retur skickas.
8. Öppna `/admin/installningar` och ange fraktpris. Kassan är stängd tills det är gjort.
9. Öppna `/admin` och hantera produkterna under `/admin/produkter`.

**Viktigt:** Kör inte bara `0001` och `0002`. Produktkatalogen använder `product_variants`, som skapas i `0003`. `0004` lägger in grundprodukterna och `0005` normaliserar de fem exempelprodukterna, skapar adminfunktionen för att spara produkter och ber PostgREST att läsa om sitt schemacache.

## Om Supabase visar "Could not find a relationship" för `product_variants`

- Kontrollera att `0003_variants.sql` har körts utan fel.
- Kontrollera att `public.product_variants` finns och att dess `product_id` har en foreign key till `public.products(id)`.
- Kör `0005_catalog_admin.sql` efter de tidigare migrationerna. Den innehåller `NOTIFY pgrst, 'reload schema'`.
- Om felet kvarstår: kör `NOTIFY pgrst, 'reload schema';` i Supabase SQL Editor och kontrollera att API:t exponerar schemat `public`.

## Deploy-checklista (Vercel)

1. Filerna ska ligga i **repots rot** (`package.json`, `app/`, `lib/` direkt i roten), inte i en undermapp. Zip-filerna har en toppmapp som heter `northern-stingers/`; packa upp innehållet i den, inte mappen själv.
2. Kör nya migrationer i Supabase **innan** du deployar kod som använder dem. För Sprint 01 krävs också `0013_checkout_total_guard.sql` **innan** checkout-koden deployas. Annars kan inga nya order skapas (RPC `create_order_checked` saknas).
3. Efter ändrade miljövariabler krävs en ny deploy.
4. Kontrollera i Vercel → Deployments att senaste deployen är **Ready** och **Current**. Misslyckas ett bygge ligger den gamla versionen kvar live.
5. Ett snabbt sätt att se vilken kod som körs: spara en admin-sida och leta efter ändringen, eller jämför med `CHANGELOG.md`.

## Kontobekräftelse (Supabase Auth)

I Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://northernstingers.store` (aldrig en `*.vercel.app`- eller `localhost`-adress).
- **Redirect URLs:** lägg till `https://northernstingers.store/**` (och `https://www.northernstingers.store/**` om du använder www).

Länken i bekräftelsemejlet går till `/auth/callback`, som loggar in kunden och skickar vidare till `/konto`. Supabase skickar sina egna kontomejl (bekräftelse, glömt lösenord) via en inbyggd avsändare med låg gräns per timme. För skarp drift: koppla Supabase till Resend under Authentication → SMTP Settings.

## E-postbekräftelser (Resend)

Kunden får tre mejl: orderbekräftelse (med Swish-uppgifter och statuslänk), betalning mottagen och order skickad. Mejlen skickas från servern via Resend, högst ett per order och typ, och ett mejlfel stoppar aldrig en order. Status och "Försök igen" finns på varje order i admin.

Så här kommer du igång:

1. Skapa ett konto på resend.com och lägg till din domän (t.ex. `northernstingers.store`) under **Domains**.
2. Lägg in de DNS-poster Resend visar (SPF och DKIM) hos din domänleverantör och vänta tills domänen står som **Verified**. Utan verifierad domän avvisas eller skräppostas mejlen.
3. Skapa en API-nyckel under **API Keys**.
4. Sätt `RESEND_API_KEY` (Secret) och `EMAIL_FROM` (t.ex. `Northern Stingers <order@northernstingers.store>`) i Vercel. `EMAIL_REPLY_TO` är valfri.
5. Kör migration `0010_email_log.sql`, gör en ny deploy och lägg en testorder med din egen e-postadress.

Utan `RESEND_API_KEY`/`EMAIL_FROM` skickas inga mejl. I v12 hålls kassan stängd tills Resend är konfigurerat, eftersom orderbekräftelser och mottagningsbevis för ångermeddelanden måste kunna skickas. Misslyckade transaktionsmejl syns i admin och kan skickas om när tjänsten fungerar.

## Sprint 02 – drift, gemensam rate-limit och obetalda order

> **Integration av Sprint 01 + 02:** Installationsordning 0013 före 0014. Migrering 0014 bör testas på ett
> isolerat Supabase-projekt innan någonting installeras i produktion.

### Installationsordning (staging först)

1. Behåll samtliga befintliga migrationer. Sprint 01 inkluderar 0013.
   Kör 0013 före 0014; båda filerna ingår i den sammanslagna versionen.
2. Applicera `supabase/migrations/0014_sprint02_operations.sql` mot **staging**.
   Migreringen kräver Supabase Cron (`pg_cron`). Den installerar tabeller/RPC:er
   och en cron-körning var femte minut.
3. **Obs: avbokningar är AVSTÄNGDA som standard.** Cron skriver endast en
   körningslogg. Detta är avsiktligt: med manuell Swish-betalning är en order
   utan klick på ”Jag har betalat” inte bevisligen obetald.
4. Kontrollera `/admin/drift`: ”Automatisk avbokning” ska visa **Pausad**
   och ”Automatisk orderstädning” ska få en färsk körning.
5. Kör enhetstester och databastester på ett **separat, tomt, lokalt testprojekt**,
   inklusive `supabase/tests/orders_flow.test.sql` som nu innehåller Sprint 02-testfall.
   Bekräfta att antalet reserverade varor och användningar av rabattkoder återställs
   och att `payments.reported_at IS NOT NULL` aldrig autoavbokas.
6. Om butiksägaren **uttryckligen** har kontrollerat bankens Swish-transaktioner,
   eventuella försenade betalningar och rutinen för kundinformation kan policyn
   aktiveras. Exempel (kör **endast** i avsett testprojekt först):

   ```sql
   update public.shop_settings
      set value = jsonb_set(value, '{enabled}', 'true'::jsonb),
          updated_at = now()
    where key = 'auto_expiry';
   ```

   Återställ till `false` för att pausa avbokningar. Ändra aldrig detta utan att
   förstå att gamla, orapporterade order då kan avbokas vid nästa cron-körning.

### Beteende och risker

- **24 timmar efter orderns skapande** är gränsen vid aktiverad avbokning.
  Endast `orders.status = pending`, `payments.status = initiated`
  och `payments.reported_at IS NULL` kan avbokas.
- Kundens ”Jag har betalat” hindrar automatisk avbokning men
  bekräftar **inte** själva Swish-betalningen. Admin måste fortfarande verifiera
  mot bankkontot. Kundens betalning kan också ha gått igenom utan att kunden
  tryckt på rapportknappen; detta är huvudskälet till att funktionen är avstängd.
- Samma transaktion uppdaterar order, betalning, reserverat lager,
  rabattutnyttjande, orderhändelse och auditlogg. Konkurrrenta arbetare
  använder `FOR UPDATE SKIP LOCKED` och kontroll av betalningsstatus.
- Delad rate limiting för alla befintliga server actions använder PostgreSQL
  och hashade HMAC-nycklar. Databasfel **blockerar** anropet (fail closed).
  `SUPABASE_SERVICE_ROLE_KEY` behövs; `RATE_LIMIT_HASH_SECRET` är valfri
  men rekommenderas (lång, konsekvent hemlighet i alla Vercel-instanser).
  Lägg aldrig den i en `NEXT_PUBLIC_`-variabel.
- Konfigurationskrav: **migrering 0014 måste köras före** att ny kod
  med asynkron `rateLimit` deployas, annars blockeras offentliga actions.
- `/admin/drift` visar cron-körning, pausad/aktiv policy, gammal orderkö,
  betalningsrapporter för manuell kontroll, misslyckade e-post-/Discord-notiser
  och lågt lager. Det är en **adminöversikt**, inte en extern larmtjänst.
- Före aktivering i skarp drift: formulera en tydlig kundinformation om
  24-timmarsgränsen och rutin för sena Swish-betalningar/återbetalning.
  Ingen automatisk återbetalning eller kundavisering ingår i Sprint 02.
- Följ jobbkörningar i Supabase Dashboard → Cron eller i databasen via
  `select jobname,schedule from cron.job`. Kontrollera att `system_job_runs`
  fortsätter uppdateras. Inga hemligheter eller kundmejl loggas i drifttabellen.

### Testkommando

```bash
npm ci
npm run typecheck
npm test
```

SQL-tester måste köras lokalt med Supabase/PostgreSQL och `pg_cron`
efter bootstrap + migrationer; de körs **inte** av GitHub Actions.

## Miljövariabler

`NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` används av den publika Supabase-klienten. `SUPABASE_SERVICE_ROLE_KEY`, `SWISH_NUMBER`, `DISCORD_WEBHOOK_URL`, `RESEND_API_KEY` och andra hemligheter ska endast sättas på servern. Använd aldrig `NEXT_PUBLIC_`-prefix för hemligheter.

`.env.local` ska inte checkas in eller delas i en projekt-ZIP. `.env.example` innehåller endast tomma platshållare.

## Nyhetsbrev och juridisk information (v12)

- Registrering kräver en aktiv samtyckesruta; samtyckestext, version, källa och tidpunkt sparas. Avregistrering sker via en unik länk och en bekräftelseåtgärd.
- `/admin/nyhetsbrev` visar prenumeranter, bekräftelsestatus och ger CSV-export. Nyhetsbrevet använder double opt-in via Resend: en adress exporteras först efter att den har bekräftats, och avregistrerade eller äldre obekräftade adresser tas inte med.
- `/retur-och-reklamation` har onlineformulär för ångermeddelande. Mottagningsbevis skickas via Resend. `/admin/returer` visar ärenden och låter admin skicka om kvittens. Konfigurera och testa Resend före lansering.
- Juridiska sidor är uppdaterade på svenska. Företagsnamn, organisationsnummer, adress, telefon, momsnummer och leveranstidsuppskattning hämtas från miljövariablerna `BUSINESS_LEGAL_NAME`, `BUSINESS_ORG_NUMBER`, `BUSINESS_ADDRESS`, `BUSINESS_PHONE`, `BUSINESS_RETURN_ADDRESS`, `BUSINESS_VAT_NUMBER`, `BUSINESS_EMAIL` och `PUBLIC_DELIVERY_ESTIMATE`. Fyll i riktiga uppgifter före lansering.
- Nyhetsbrevskampanjer, full engelsk lokalisering och cookie-banner för framtida icke-nödvändig analys ingår inte ännu. Se `docs/IMPLEMENTATION_STATUS.md`.

## Produktkatalog

Migrationerna skapar följande exempelprodukter enligt produktunderlaget:

- Kedje Stinger: SMALL 29 kr, MEDIUM 35 kr, LARGE 39 kr.
- UV Kedje Stinger: SMALL 35 kr, MEDIUM 39 kr, LARGE 45 kr.
- Jiggskallar 4-pack: 7G 35 kr, 10G 39 kr.
- Mono Gäddtafs 3-pack: 20CM 29 kr, 30CM 35 kr, 40CM 39 kr.
- Fiskevåg 50KG: 199 kr.

Beskrivningar och namn finns på svenska och engelska. Bilder för exempelprodukterna behöver laddas upp separat.

### Variantlager och bilder

1. Kör samtliga migrationer till och med `20261125180652_variant_inventory_and_images.sql` i staging. Kör databastesterna på en tom testdatabas med `pg_cron` efter migrationerna.
2. Kör variantmigrationen i måldatabasen före utrullning av appen. Den ställer i ordning bildbehållaren `product-images` i Supabase Storage. Servern använder `SUPABASE_SERVICE_ROLE_KEY` när en administratör laddar upp bilder.
3. Inventera fysiska enheter per variant. Under **Admin → Lager** flyttar du de inventerade enheterna från gemensamt saldo till respektive variant. Ange 0 för att börja spåra en slutsåld variant. Äldre varianter utan eget saldo använder gemensamt saldo tills du räknat och flyttat deras enheter. Öppna reservationer hanteras mot sitt ursprungliga saldo. Nya varianter börjar med 0 i lager.
4. Under **Admin → Produkter → Redigera → Variantbilder** laddar du upp två till tre JPEG-, PNG- eller WebP-bilder per variant och väljer huvudbild.

## Betalning och notiser

Swish används **utan Swish API**: QR skapas lokalt, appknappen är best-effort, och **admin verifierar varje betalning manuellt** under `/admin/ordrar`. Nya order och kundrapporter skickas till Discord (`DISCORD_WEBHOOK_URL`, `DISCORD_ROLE_ID`). Se `docs/IMPLEMENTATION_STATUS.md` för vad som är verifierat och vad som kräver test i din miljö.

## Sprint 01 – säker prissättning i kassan

- Kassan hämtar en aktuell serverberäknad offert för varor, varianter, rabatt, frakt och totalbelopp. Om hämtningen misslyckas blockeras köpknappen, i stället för att visa priser från webbläsarens varukorg.
- `create_order_checked` (migration 0013) anropar den befintliga transaktionssäkra `create_order` och avbryter/återställer **hela transaktionen** om slutbeloppet har ändrats sedan kunden såg offerten. Kunden måste då granska det nya beloppet och försöka igen.
- Prisberäkning och lagerstatus är en förhandsvisning, **inte** en reservation. Skapandet av ordern låser/validerar lager och rabatt atomärt precis som tidigare.
- **Driftsättning:** kör migration 0013 i ett separat Supabase-testprojekt, kör SQL- och enhetstester, verifiera kassaflödet och kör sedan migrationen i den avsedda produktionsdatabasen **före** att den nya appversionen rullas ut. Inget i denna branch kör migrationer automatiskt. Byt inte till den nya appversionen utan migration 0013.
- GitHub Actions `Checkout validation` kör TypeScript- och enhetstester vid pull requests. SQL-tester måste köras separat mot en tom lokal testdatabas.

## Tester

- `npm run typecheck`, `npm test` (enhetstester), `npm run build`.
- Databastester: kör `supabase/tests/00_local_bootstrap.sql`, migrationerna 0001–0014 och `supabase/tests/orders_flow.test.sql` mot en TOM lokal PostgreSQL. Aldrig mot Supabase-produktion.

Detaljerad status och kvarvarande arbete: [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md).

Testa alltid med ett separat Supabase-testprojekt innan migrationer körs i produktion.

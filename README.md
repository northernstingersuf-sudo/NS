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
5. Starta utvecklingsservern med `npm run dev`.
6. Skapa ett konto via `/logga-in`. Ge sedan kontot adminroll från Supabase SQL Editor:
   ```sql
   update public.profiles
   set role = 'admin'
   where id = '<Ditt auth.users-id>';
   ```
7. Sätt miljövariabler (se `.env.example`) i hostingen, främst `SUPABASE_SERVICE_ROLE_KEY`, `SWISH_NUMBER`, `DISCORD_WEBHOOK_URL`, `DISCORD_ROLE_ID`.
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
2. Kör nya migrationer i Supabase **innan** du deployar kod som använder dem.
3. Efter ändrade miljövariabler krävs en ny deploy.
4. Kontrollera i Vercel → Deployments att senaste deployen är **Ready** och **Current**. Misslyckas ett bygge ligger den gamla versionen kvar live.
5. Ett snabbt sätt att se vilken kod som körs: spara en admin-sida och leta efter ändringen, eller jämför med `CHANGELOG.md`.

## E-postbekräftelser (Resend)

Kunden får tre mejl: orderbekräftelse (med Swish-uppgifter och statuslänk), betalning mottagen och order skickad. Mejlen skickas från servern via Resend, högst ett per order och typ, och ett mejlfel stoppar aldrig en order. Status och "Försök igen" finns på varje order i admin.

Så här kommer du igång:

1. Skapa ett konto på resend.com och lägg till din domän (t.ex. `northernstingers.store`) under **Domains**.
2. Lägg in de DNS-poster Resend visar (SPF och DKIM) hos din domänleverantör och vänta tills domänen står som **Verified**. Utan verifierad domän avvisas eller skräppostas mejlen.
3. Skapa en API-nyckel under **API Keys**.
4. Sätt `RESEND_API_KEY` (Secret) och `EMAIL_FROM` (t.ex. `Northern Stingers <order@northernstingers.store>`) i Vercel. `EMAIL_REPLY_TO` är valfri.
5. Kör migration `0010_email_log.sql`, gör en ny deploy och lägg en testorder med din egen e-postadress.

Utan `RESEND_API_KEY`/`EMAIL_FROM` skickas inga mejl, men beställningar fungerar som vanligt. Misslyckade utskick syns då som "not_configured" och kan skickas om när du har konfigurerat tjänsten.

## Miljövariabler

`NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` används av den publika Supabase-klienten. `SUPABASE_SERVICE_ROLE_KEY`, `SWISH_NUMBER`, `DISCORD_WEBHOOK_URL`, `RESEND_API_KEY` och andra hemligheter ska endast sättas på servern. Använd aldrig `NEXT_PUBLIC_`-prefix för hemligheter.

`.env.local` ska inte checkas in eller delas i en projekt-ZIP. `.env.example` innehåller endast tomma platshållare.

## Produktkatalog

Migrationerna skapar följande exempelprodukter enligt produktunderlaget:

- Kedje Stinger: SMALL 29 kr, MEDIUM 35 kr, LARGE 39 kr.
- UV Kedje Stinger: SMALL 35 kr, MEDIUM 39 kr, LARGE 45 kr.
- Jiggskallar 4-pack: 7G 35 kr, 10G 39 kr.
- Mono Gäddtafs 3-pack: 20CM 29 kr, 30CM 35 kr, 40CM 39 kr.
- Fiskevåg 50KG: 199 kr.

Beskrivningar och namn finns på svenska och engelska. Produktbilder saknas i exempelunderlaget och behöver laddas upp till Supabase Storage och kopplas via `product_images`.

## Betalning och notiser

Swish används **utan Swish API**: QR skapas lokalt, appknappen är best-effort, och **admin verifierar varje betalning manuellt** under `/admin/ordrar`. Nya order och kundrapporter skickas till Discord (`DISCORD_WEBHOOK_URL`, `DISCORD_ROLE_ID`). Se `docs/IMPLEMENTATION_STATUS.md` för vad som är verifierat och vad som kräver test i din miljö.

## Tester

- `npm run typecheck`, `npm test` (enhetstester), `npm run build`.
- Databastester: kör `supabase/tests/00_local_bootstrap.sql`, migrationerna 0001–0010 och `supabase/tests/orders_flow.test.sql` mot en TOM lokal PostgreSQL. Aldrig mot Supabase-produktion.

Detaljerad status och kvarvarande arbete: [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md).

Testa alltid med ett separat Supabase-testprojekt innan migrationer körs i produktion.

# Implementation status – 4 november 2026

## Klart i denna version (steg 4–7 i utvecklingsbriefen)

- **Migrationer `0006_orders_checkout.sql` och `0007_notify_payment_verified.sql`** (ändrar inga tidigare migrationer):
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
- **Discord**: tre notiser (ny order, kund rapporterat betalning, betalning verifierad av admin; migration `0007`). Webhook från servern, riktig rollmention + `allowed_mentions`, ingen persondata, dedupe och retry via `notification_log`, fel stoppar aldrig ordern.
- **Admin**: Beställningar (sök/status/datum), orderdetalj (verifiera betalning med beloppskontroll, statusflöde, spårning, administrativ återbetalning, händelsehistorik, Discord-status + "försök igen"), Lager (loggad justering), Inställningar (frakt + driftkontroll utan att visa hemligheter), dashboard med riktiga värden.

## Verifierat

- `npm run typecheck`: OK. `npm test`: 21/21 (Swish-format, Discord-payload, kassavalidering). `next build`: OK (med Google Fonts ersatt tillfälligt, eftersom byggmiljön saknade internet mot Google; ingen kodändring kvar).
- Databastest `supabase/tests/orders_flow.test.sql` mot tom lokal PostgreSQL 16 efter 0001–0006: alla kontroller gick igenom, bl.a. serverpris, idempotens, ingen överförsäljning, avbokning frigör lager/rabatt, kunder ser bara egna order, anon/kund kan inte anropa kundfunktioner eller adminfunktioner, kundrapport ändrar inte betalstatus, dubbelverifiering och fel belopp nekas, notisdedupe/retry, variant-ID bevaras.
- Samtidighet med riktiga parallella sessioner: 8 samtidiga köp mot saldo 3 gav exakt 3 order (reserverat 3/3). 6 samtidiga anrop med samma nyckel gav 1 order och 1 reservation.

## EJ verifierat (kräver din miljö)

- Supabase-projektet i produktion (migrationer, PostgREST-schemacache, att rollen `service_role` har EXECUTE på funktionerna).
- Själva appen mot en riktig Supabase: anropen `rpc(...)` och sidorna har typkontrollerats och byggts men inte körts mot en databas.
- **Swish i telefon.** Formatdetaljerna är hämtade från briefen och sekundära källor, inte från Swish specifikation: decimalkomma i beloppet och sista fältets (`lock_mask = 0`) betydelse. Skanna QR med Swish-appen på iOS och Android och kontrollera mottagare, belopp, referens. Justera i `lib/swish.ts` vid avvikelse. Appknappens länkformat är inofficiellt.
- Discord: kräver riktig webhook, roll-ID och rätt att pinga rollen.
- Mobil/tillgänglighet, bildhantering och prestanda.

## Kända begränsningar

- Lager spåras per produkt, inte per variant. Variantens `in_stock`-flagga styr tillgänglighet.
- Order som skapades innan lagerspårning startade påverkar inte saldot.
- Obetalda order håller reservation tills admin avbokar (ingen automatisk utgång).
- Rate limiting är per serverinstans (in-memory). Komplettera med hostingens regler.
- Inga e-postbekräftelser skickas. Gästen får en statuslänk.
- Frakt är ett fast pris med valfri fri-fraktgräns, endast Sverige.

## Återstår

- Bildhantering i admin (Supabase Storage), kategorihantering, kunder, rabattkoder (databasstöd finns, admin-UI saknas), recensionsmoderering, nyhetsbrevsexport.
- Svenska/engelska genom hela köpresan (nya sidor är svenska).
- Admin-MFA, CSP, samtyckesstyrd analys/statistik, backup/återställningstest, juridiska texter.
- Kundkonto: orderlänk till statussida.

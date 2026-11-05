# Ändringslogg

## v11.1
- **Tydligare registreringsfel:** begränsning av antal mejl, ogiltig e-post, svagt lösenord och avstängda registreringar ger egna meddelanden, och orsaken (felkod, inte adress) loggas på servern.
- **Kontobekräftelse:** ny `/auth/callback` som tar emot länken i Supabases bekräftelsemejl och loggar in kunden (stöd för både `code` och `token_hash`). Registreringen skickar nu `emailRedirectTo` till sajten. Tidigare hamnade kunden på fel sida och blev inte inloggad. Kräver rätt Site URL och Redirect URLs i Supabase (se README).

## v11 (4 november 2026)
- **E-postbekräftelser** via Resend: orderbekräftelse, betalning mottagen och order skickad. Migration 0010 (`email_log`, dedupe och retry).
- Admin: sektionen "Kundmejl" på varje order med status och "Försök igen". Driftkontrollen visar om `RESEND_API_KEY` och `EMAIL_FROM` är satta.
- Orderstatussidan nämner mejlen bara när e-post är konfigurerad.
- Mejlen innehåller aldrig adress eller telefonnummer, allt dynamiskt innehåll escapas, och mejlfel läcker aldrig API-nyckel eller mottagare.
- Verifierat: 30 enhetstester och utökade databastester. Själva utskicket mot Resend är inte testat mot en riktig tjänst.

## v10 (4 november 2026)
Samlad version. Allt nedan är inbyggt; ingen ny funktionalitet utöver v9, men dokumentationen är uppdaterad och granskad.

### Tillagt sedan v4
- **Kassa och betalning (v5):** gästkassa `/kassa`, orderstatussida `/order/[token]` med lokalt genererad Swish-QR, appknapp, "Jag har betalat" (rapporterar bara), manuell verifiering i admin. Migration 0006.
- **Discord (v5–v7):** fyra notiser (ny order, kund rapporterat betalning, betalning verifierad, order skickad) med dedupe och "Försök igen". Migrationerna 0007 och 0008.
- **Admin (v5):** Beställningar, orderdetalj, Lager, Inställningar (frakt + driftkontroll), dashboard med riktiga värden.
- **Skicka direkt (v8):** betald order kan markeras som skickad utan att först packas. Migration 0009.
- **Robusta statusknappar (v9):** statusen är inbyggd i varje knapp och resultatet kontrolleras mot databasen, så ett uteblivet byte visas som fel i stället för "uppdaterad".

### Rättat
- `product_images.variant_id` saknades i databasen, vilket gav tom katalog.
- Typfel på produktsidan.
- Variant-ID:n raderades vid varje produktsparning (variantbilder och orderkopplingar gick förlorade).
- Statusknapparna i admin sparade bara spårningsnumret (statusen följde inte med). Rättat i v9. Efter att fixen deployats bekräftades att statusbyten fungerar.

### Verifiering
- 23 enhetstester, databastester mot lokal PostgreSQL (migrationerna 0001–0009) och samtidighetstester med parallella sessioner. Se `docs/IMPLEMENTATION_STATUS.md`.

## v4
Utgångsläget: katalog, varukorg, konto, produktadmin (migrationerna 0001–0005).

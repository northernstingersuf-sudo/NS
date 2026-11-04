-- Databastest för 0006. Körs mot en TOM lokal testdatabas efter 00_local_bootstrap.sql + migrationerna 0001–0006.
-- Aldrig mot produktion. Avbryter med fel vid första misslyckade kontroll.
\set ON_ERROR_STOP on
\set QUIET on

create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as
$$ begin if cond is not true then raise exception 'TEST FAILED: %', msg; end if; raise notice 'ok  - %', msg; end $$;

-- Kör SQL och förväntar sig ett fel vars text/SQLSTATE innehåller p_expect.
create function pg_temp.fails(p_sql text, p_expect text, p_msg text) returns void language plpgsql as
$$ begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm like '%' || p_expect || '%' or sqlstate = p_expect then
      raise notice 'ok  - % (%)', p_msg, sqlerrm; return;
    end if;
    raise exception 'TEST FAILED: % – fel fanns men var fel: % / %', p_msg, sqlstate, sqlerrm;
  end;
  raise exception 'TEST FAILED: % – inget fel kastades', p_msg;
end $$;

grant all on all functions in schema pg_temp to public;
-- Gör temp-tabeller (skapade av olika roller) läsbara för alla testroller.
create function pg_temp.share() returns void language plpgsql as
$$ declare r record; begin
  for r in select schemaname, tablename from pg_tables where schemaname like 'pg_temp%' loop
    execute format('grant select on %I.%I to public', r.schemaname, r.tablename);
  end loop; end $$;


-- ---- Testdata (som superuser) ----
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.se'),
  ('00000000-0000-0000-0000-0000000000c1', 'kund1@test.se'),
  ('00000000-0000-0000-0000-0000000000c2', 'kund2@test.se');
update profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';

create temp table ids as
select
  (select id from product_variants where sku = 'NS-KS-M') as v_ks_m,     -- Kedje Stinger MEDIUM 3500
  (select id from product_variants where sku = 'NS-KS-L') as v_ks_l,     -- LARGE 3900
  (select id from product_variants where sku = 'NS-JS-7') as v_js_7,     -- Jiggskallar 7G 3500
  (select id from products where slug = 'kedje-stinger') as p_ks,
  (select id from products where slug = 'fiskevag-50-kg') as p_fv,       -- 19900, utan varianter
  (select id from products where slug = 'jiggskallar-4-pack') as p_js;
grant select on ids to public;
select pg_temp.ok((select count(*) from ids where v_ks_m is not null and p_fv is not null) = 1, 'seed-produkter finns');

-- ---- 1. Kassan är stängd tills frakt är konfigurerad ----
set role service_role;
select pg_temp.fails($q$ select create_order('key-no-shipping-0000000001', null, 'a@b.se', 'sv', '{"name":"A"}',
  jsonb_build_array(jsonb_build_object('id', (select p_fv from ids), 'qty', 1))) $q$, 'shipping_not_configured', 'order stoppas utan fraktinställning');
reset role;

-- Admin sätter frakt: 49 kr, fri frakt över 500 kr
select pg_temp.share();
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into shop_settings (key, value) values ('shipping', '{"flat_ore":4900,"free_over_ore":50000}');
reset role;

-- ---- 2. Serverberäknade priser + idempotens ----
set role service_role;
create temp table r1 as select create_order('key-order-one-000000000001', '00000000-0000-0000-0000-0000000000c1', 'Kund1@Test.se', 'sv',
  '{"name":"Kund Ett","line1":"Gatan 1","postal_code":"11122","city":"Stockholm","country":"SE"}',
  jsonb_build_array(jsonb_build_object('id', (select v_ks_m from ids), 'qty', 2),
                    jsonb_build_object('id', (select p_fv from ids), 'qty', 1))) as j;
select pg_temp.ok((select (j->>'total_ore')::int from r1) = 2*3500 + 19900 + 4900, 'total = rader + frakt beräknad av servern (318 kr)');
select pg_temp.ok((select (j->>'created')::boolean from r1), 'första anropet skapar order');
select pg_temp.ok((select j->>'order_number' from r1) ~ '^NS-20[0-9]{2}-[0-9]{6}$', 'ordernummer har formatet NS-ÅÅÅÅ-NNNNNN');

create temp table r1b as select create_order('key-order-one-000000000001', null, 'x@x.se', 'sv', '{}', jsonb_build_array(jsonb_build_object('id', (select p_fv from ids), 'qty', 9))) as j;
select pg_temp.ok((select j->>'order_id' from r1b) = (select j->>'order_id' from r1) and not (select (j->>'created')::boolean from r1b),
  'samma idempotensnyckel ger samma order (ingen dubblett)');
reset role;
select pg_temp.ok((select count(*) from orders) = 1, 'exakt en order efter replay');
select pg_temp.ok((select email from orders) = 'kund1@test.se', 'e-post normaliseras till gemener');
select pg_temp.ok((select count(*) from order_items where order_id = (select (j->>'order_id')::uuid from r1)) = 2, 'orderrader sparade');
select pg_temp.ok((select name||'/'||variant||'/'||unit_price_ore from order_items where sku = 'NS-KS-M') = 'Kedje Stinger/MEDIUM/3500', 'orderrad sparar namn, variant och pris vid köptillfället');
select pg_temp.ok((select status::text||'/'||amount_ore||'/'||reference from payments) = 'initiated/31800/' || (select order_number from orders), 'betalningspost: väntande, rätt belopp, referens=ordernummer');
select pg_temp.ok((select order_number from orders) is not null and (select guest_token from orders) is not null, 'gästtoken skapad');

-- ---- 3. Fri frakt över gräns, produkt med varianter kräver variant, ogiltiga rader ----
set role service_role;
select pg_temp.fails($q$ select create_order('key-variant-required-00001', null, 'a@b.se', 'sv', '{"name":"A"}',
  jsonb_build_array(jsonb_build_object('id', (select p_ks from ids), 'qty', 1))) $q$, 'variant_required', 'produkt med varianter kan inte köpas utan variant');
select pg_temp.fails($q$ select create_order('key-badqty-000000000001', null, 'a@b.se', 'sv', '{"name":"A"}',
  jsonb_build_array(jsonb_build_object('id', (select p_fv from ids), 'qty', 0))) $q$, 'invalid_quantity', 'antal 0 nekas');
select pg_temp.fails($q$ select create_order('key-bademail-00000000001', null, 'inte-en-epost', 'sv', '{"name":"A"}',
  jsonb_build_array(jsonb_build_object('id', (select p_fv from ids), 'qty', 1))) $q$, 'invalid_email', 'ogiltig e-post nekas');
select pg_temp.fails($q$ select create_order('short', null, 'a@b.se', 'sv', '{"name":"A"}', '[]') $q$, 'invalid_idempotency_key', 'för kort idempotensnyckel nekas');
select pg_temp.fails($q$ select create_order('key-unknown-prod-0000001', null, 'a@b.se', 'sv', '{"name":"A"}',
  jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'qty', 1))) $q$, 'product_unavailable', 'okänd produkt nekas');
create temp table r_free as select create_order('key-free-shipping-0000001', null, 'fri@test.se', 'sv', '{"name":"F"}',
  jsonb_build_array(jsonb_build_object('id', (select p_fv from ids), 'qty', 3))) as j;   -- 597 kr >= 500 kr
select pg_temp.ok((select (j->>'total_ore')::int from r_free) = 3 * 19900, 'fri frakt när delsumman når gränsen');
reset role;
select pg_temp.ok((select shipping_ore from orders where email = 'fri@test.se') = 0, 'fraktkostnad 0 sparad');

-- ---- 4. Lager: reservation, ingen överförsäljning ----
-- Admin börjar spåra saldo för Fiskevåg: 4 st
select pg_temp.share();
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select admin_adjust_stock((select p_fv from ids), 4, 'Initialt saldo');
reset role;
select pg_temp.ok((select quantity||'/'||reserved from inventory where product_id = (select p_fv from ids)) = '4/0', 'saldo 4, inget reserverat');

set role service_role;
create temp table r_stock1 as select create_order('key-stock-first-000000001', null, 'lager1@test.se', 'sv', '{"name":"L"}',
  jsonb_build_array(jsonb_build_object('id', (select p_fv from ids), 'qty', 3))) as j;
select pg_temp.fails($q$ select create_order('key-stock-second-00000001', null, 'lager2@test.se', 'sv', '{"name":"L"}',
  jsonb_build_array(jsonb_build_object('id', (select p_fv from ids), 'qty', 2))) $q$, 'insufficient_stock', 'andra ordern som skulle ge negativt saldo nekas');
reset role;
select pg_temp.ok((select reserved from inventory where product_id = (select p_fv from ids)) = 3, 'reserved = 3 efter första ordern; den nekade ordern lämnade inga spår');
select pg_temp.ok((select count(*) from orders where email = 'lager2@test.se') = 0, 'nekad order skapades inte');

-- Samma produkt två gånger på samma order aggregeras
set role service_role;
create temp table r_agg as select create_order('key-aggregate-00000000001', null, 'agg@test.se', 'sv', '{"name":"L"}',
  jsonb_build_array(jsonb_build_object('id', (select v_ks_l from ids), 'qty', 1), jsonb_build_object('id', (select v_ks_l from ids), 'qty', 2))) as j;
reset role;
select pg_temp.ok((select count(*)||'/'||sum(quantity) from order_items where order_id = (select (j->>'order_id')::uuid from r_agg)) = '1/3', 'dubbletter slås ihop till en rad');

-- Lager kan inte sänkas under reserverat
select pg_temp.share();
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.fails($q$ select admin_adjust_stock((select p_fv from ids), -2, 'För lågt test') $q$, 'stock_below_reserved', 'lager kan inte justeras under reserverat saldo');
reset role;

-- ---- 5. Behörigheter ----
set request.jwt.claim.sub = '';   -- anon-JWT har ingen sub
set role anon;
select pg_temp.fails($q$ select create_order('key-anon-attempt-00000001', null, 'a@b.se', 'sv', '{}', '[]') $q$, '42501', 'anon kan inte anropa create_order');
select pg_temp.fails($q$ select report_payment(gen_random_uuid()) $q$, '42501', 'anon kan inte anropa report_payment');
select pg_temp.fails($q$ select claim_notification(gen_random_uuid(), 'order_created') $q$, '42501', 'anon kan inte anropa claim_notification');
select pg_temp.ok((select count(*) from orders) = 0, 'anon ser inga order');
select pg_temp.ok((select count(*) from payments) = 0, 'anon ser inga betalningar');
select pg_temp.ok((select count(*) from order_events) = 0 and (select count(*) from notification_log) = 0, 'anon ser inga händelser/notiser');
select pg_temp.ok((select count(*) from shop_settings) = 0, 'anon ser inga inställningar');
reset role;

set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select pg_temp.fails($q$ select create_order('key-auth-attempt-00000001', null, 'a@b.se', 'sv', '{}', '[]') $q$, '42501', 'inloggad kund kan inte anropa create_order direkt');
select pg_temp.ok((select count(*) from orders) = 1, 'kund 1 ser bara sin egen order');
select pg_temp.ok((select count(*) from order_items) = 2, 'kund 1 ser bara sina egna orderrader');
select pg_temp.ok((select count(*) from payments) = 0, 'kund ser inte betalningsposter (verifieringsdata)');
select pg_temp.fails($q$ select admin_verify_payment((select id from orders limit 1), 1) $q$, '42501', 'kund kan inte verifiera betalning');
select pg_temp.fails($q$ select admin_update_order((select id from orders limit 1), 'cancelled', null) $q$, '42501', 'kund kan inte ändra orderstatus');
select pg_temp.fails($q$ select admin_adjust_stock((select p_fv from ids), 100, 'fusk') $q$, '42501', 'kund kan inte justera lager');
select pg_temp.fails($q$ select admin_save_product('{"slug":"hack","name_sv":"H","price_ore":1}'::jsonb) $q$, '42501', 'kund kan inte skapa produkt');
update orders set status = 'paid', total_ore = 1;      -- RLS: ingen update-policy => 0 rader påverkas
delete from order_items;                               -- samma för delete
reset role;
select pg_temp.ok((select count(*) from orders where status = 'paid' or total_ore = 1) = 0 and (select count(*) from order_items) > 0, 'kund kan inte ändra eller radera order/orderrader direkt (RLS)');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.ok((select count(*) from orders) = 0, 'kund 2 ser inte kund 1:s order');
reset role;

-- ---- 6. Kundrapport ändrar inte betalstatus ----
create temp table tok as select guest_token, id from orders where order_number = (select j->>'order_number' from r1);
grant select on tok to public;
set role service_role;
select pg_temp.ok((select (report_payment((select guest_token from tok))->>'first_report')::boolean), 'första rapporten registreras');
select pg_temp.ok(not (select (report_payment((select guest_token from tok))->>'first_report')::boolean), 'andra rapporten är en no-op');
select pg_temp.fails($q$ select report_payment(gen_random_uuid()) $q$, 'order_not_found', 'okänd token ger order_not_found');
reset role;
select pg_temp.ok((select p.status::text||'/'||(p.reported_at is not null)||'/'||o.status::text from payments p join orders o on o.id = p.order_id where o.id = (select id from tok)) = 'initiated/true/pending',
  'efter kundrapport: betalning fortfarande "initiated", order fortfarande "pending"');
select pg_temp.ok((select count(*) from order_events where order_id = (select id from tok) and kind = 'payment_reported') = 1, 'rapporten loggas en gång');

-- ---- 7. Manuell verifiering (admin) ----
select pg_temp.share();
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.fails($q$ select admin_verify_payment((select id from tok), 100) $q$, 'amount_mismatch', 'fel belopp nekas vid verifiering');
select pg_temp.fails($q$ select admin_update_order((select id from tok), 'paid', null) $q$, 'invalid_transition', 'pending → paid går inte att sätta direkt');
select pg_temp.fails($q$ select admin_update_order((select id from tok), 'shipped', null) $q$, 'invalid_transition', 'pending → shipped nekas');
select admin_verify_payment((select id from tok), 31800);
reset role;
select pg_temp.ok((select p.status::text||'/'||(p.verified_by = '00000000-0000-0000-0000-0000000000a1')||'/'||(p.verified_at is not null)||'/'||o.status::text from payments p join orders o on o.id = p.order_id where o.id = (select id from tok)) = 'paid/true/true/paid',
  'verifierad: status paid, vem/när sparad');
select pg_temp.share();
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.fails($q$ select admin_verify_payment((select id from tok), 31800) $q$, 'payment_not_pending', 'dubbelverifiering nekas');
reset role;
select pg_temp.ok((select count(*) from audit_logs where action = 'order.payment_verified') = 1, 'verifiering loggas i audit_logs');

-- ---- 8. Statusflöde, spårning, lagerbokföring ----
select pg_temp.share();
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select admin_update_order((select id from tok), 'packed', null);
select admin_update_order((select id from tok), 'shipped', ' SE123456789 ');
select pg_temp.fails($q$ select admin_update_order((select id from tok), 'cancelled', null) $q$, 'invalid_transition', 'skickad order kan inte avbokas (ska återbetalas)');
select admin_update_order((select id from tok), 'delivered', null);
reset role;
select pg_temp.ok((select tracking_number||'/'||status::text from orders where id = (select id from tok)) = 'SE123456789/delivered', 'spårningsnummer trimmas och sparas');
select pg_temp.ok((select count(*) from order_events where order_id = (select id from tok) and kind = 'status_changed') = 3, 'statushistorik loggad (3 byten)');

-- Order 1 lades INNAN lagerspårningen startade: dess rad är inte reserverad och ska inte röra saldot.
select pg_temp.ok((select quantity||'/'||reserved from inventory where product_id = (select p_fv from ids)) = '4/3', 'order skapad före lagerspårning påverkar inte saldot');

-- Spårad order: reservera 1 st, verifiera, packa, skicka => saldo 4→3 och reservationen frigörs (3→3 kvar från r_stock1)
set role service_role;
create temp table r_ship as select create_order('key-tracked-ship-00000001', null, 'ship@test.se', 'sv', '{"name":"S"}',
  jsonb_build_array(jsonb_build_object('id', (select p_fv from ids), 'qty', 1))) as j;
grant select on r_ship to public;
reset role;
select pg_temp.ok((select quantity||'/'||reserved from inventory where product_id = (select p_fv from ids)) = '4/4', 'spårad order reserverar 1 st (4/4)');
select pg_temp.share();
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select admin_verify_payment((select (j->>'order_id')::uuid from r_ship), (select (j->>'total_ore')::int from r_ship));
select admin_update_order((select (j->>'order_id')::uuid from r_ship), 'packed', null);
select admin_update_order((select (j->>'order_id')::uuid from r_ship), 'shipped', null);
reset role;
select pg_temp.ok((select quantity||'/'||reserved from inventory where product_id = (select p_fv from ids)) = '3/3', 'skickad spårad order drar av lager och frigör sin reservation (3/3)');
select pg_temp.ok((select bool_and(not stock_reserved) from order_items where order_id = (select (j->>'order_id')::uuid from r_ship)), 'orderraden är inte längre reserverad (ingen dubbel frigörning)');

-- ---- 9. Avbokning frigör reservation och rabatt ----
select pg_temp.share();
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
insert into discounts (code, percent, active, max_uses) values ('TEST10', 10, true, 5);
reset role;
set role service_role;
create temp table r_disc as select create_order('key-discount-0000000001', null, 'rabatt@test.se', 'sv', '{"name":"R"}',
  jsonb_build_array(jsonb_build_object('id', (select v_ks_l from ids), 'qty', 5)), 'test10') as j;   -- 5*3900 = 19500, -10% = 17550 + 49 frakt
select pg_temp.fails($q$ select create_order('key-discount-bad-0000001', null, 'x@test.se', 'sv', '{"name":"R"}',
  jsonb_build_array(jsonb_build_object('id', (select v_ks_l from ids), 'qty', 1)), 'NOSUCHCODE') $q$, 'invalid_discount', 'okänd rabattkod nekas');
reset role;
select pg_temp.ok((select (j->>'total_ore')::int from r_disc) = 19500 - 1950 + 4900, 'procentrabatt (skiftlägesokänslig kod) + frakt beräknas på servern');
select pg_temp.ok((select used from discounts where code = 'TEST10') = 1, 'rabattkod räknas upp');

select pg_temp.share();
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select admin_update_order((select (j->>'order_id')::uuid from r_stock1), 'cancelled', null);
select admin_update_order((select (j->>'order_id')::uuid from r_disc), 'cancelled', null);
reset role;
select pg_temp.ok((select quantity||'/'||reserved from inventory where product_id = (select p_fv from ids)) = '3/0', 'avbokad order frigör reserverat lager (3/0)');
select pg_temp.ok((select used from discounts where code = 'TEST10') = 0, 'avbokad order återställer rabattanvändning');
select pg_temp.ok((select status::text from payments where order_id = (select (j->>'order_id')::uuid from r_stock1)) = 'cancelled', 'obetald betalning markeras cancelled vid avbokning');

-- ---- 10. Återbetalning (endast administrativ status) ----
select pg_temp.share();
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.fails($q$ select admin_register_refund((select id from tok), 99999999, 'för stor') $q$, 'invalid_refund_amount', 'återbetalning över betalt belopp nekas');
select pg_temp.fails($q$ select admin_register_refund((select (j->>'order_id')::uuid from r_agg), 100, 'obetald') $q$, 'refund_requires_verified_payment', 'återbetalning kräver verifierad betalning');
select admin_register_refund((select id from tok), 10000, 'Delåterbetalning, skadad vara');
reset role;
select pg_temp.ok((select p.status::text||'/'||p.refunded_ore||'/'||o.status::text from payments p join orders o on o.id = p.order_id where o.id = (select id from tok)) = 'paid/10000/delivered', 'delåterbetalning: betalning kvar som paid, refunded_ore uppdaterad');
select pg_temp.share();
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select admin_register_refund((select id from tok), 21800, 'Resten');
reset role;
select pg_temp.ok((select p.status::text||'/'||o.status::text from payments p join orders o on o.id = p.order_id where o.id = (select id from tok)) = 'refunded/refunded', 'full återbetalning sätter status refunded');
select pg_temp.ok((select coalesce(sum(greatest(0, amount_ore - refunded_ore)), 0) from payments where status = 'paid') = (select (j->>'total_ore')::int from r_ship), 'omsättning = endast verifierad, ej återbetald betalning (r_ship); återbetalda och väntande ingår inte');

-- ---- 11. Notiskö: dedupe och retry ----
set role service_role;
select pg_temp.ok(claim_notification((select id from tok), 'order_created'), 'första claim lyckas');
select pg_temp.ok(not claim_notification((select id from tok), 'order_created'), 'andra claim (pågående) nekas – inga dubbla notiser');
select finish_notification((select id from tok), 'order_created', false, 'discord_http_500');
select pg_temp.ok(claim_notification((select id from tok), 'order_created'), 'misslyckad notis kan tas om (retry)');
select finish_notification((select id from tok), 'order_created', true, null);
select pg_temp.ok(not claim_notification((select id from tok), 'order_created'), 'skickad notis kan inte skickas igen');
select pg_temp.ok(claim_notification((select id from tok), 'payment_reported'), 'olika notistyper räknas separat');
reset role;
select pg_temp.ok((select status||'/'||attempts from notification_log where kind = 'order_created') = 'sent/2', 'notislogg: sent efter 2 försök');

-- ---- 12. admin_save_product bevarar variant-ID:n ----
create temp table vid_before as select id, label from product_variants where product_id = (select p_ks from ids);
select pg_temp.share();
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select admin_save_product(
  jsonb_build_object('id', (select p_ks from ids), 'slug', 'kedje-stinger', 'name_sv', 'Kedje Stinger', 'price_ore', 2900, 'active', true, 'in_stock', true),
  '[{"label":"small","price_ore":3000,"position":1},{"label":"MEDIUM","price_ore":3500,"position":2},{"label":"LARGE","price_ore":3900,"position":3},{"label":"XL","price_ore":4500,"position":4}]'::jsonb);
reset role;
select pg_temp.ok((select count(*) from product_variants v join vid_before b on b.id = v.id where lower(b.label) = lower(v.label)) = 3, 'befintliga varianter behåller sina ID:n vid sparning');
select pg_temp.ok((select price_ore from product_variants where sku = 'NS-KS-S') = 3000 and (select count(*) from product_variants where product_id = (select p_ks from ids)) = 4, 'pris uppdaterat och ny variant tillagd');
select pg_temp.share();
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select admin_save_product(jsonb_build_object('id', (select p_ks from ids), 'slug', 'kedje-stinger', 'name_sv', 'Kedje Stinger', 'price_ore', 2900, 'active', true),
  '[{"label":"MEDIUM","price_ore":3500,"position":1}]'::jsonb);
reset role;
select pg_temp.ok((select count(*) from product_variants where product_id = (select p_ks from ids)) = 1, 'borttagna varianter raderas');
select pg_temp.ok((select count(*) from order_items where sku = 'NS-KS-M' and variant_id is not null) >= 1, 'orderrader behåller kopplingen till kvarvarande variant');

-- ---- 13. RLS på nya tabeller ----
select pg_temp.ok((select bool_and(relrowsecurity) from pg_class where relname in ('shop_settings','order_events','notification_log','stock_adjustments')), 'RLS på alla nya tabeller');

\echo ALLA DB-TESTER GICK IGENOM

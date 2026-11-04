-- Northern Stingers 0006: kassa, ordrar, manuell Swish-verifiering, Discord-notislogg, lager.
-- Kör efter 0001–0005. Ändrar inga tidigare migrationer.
--
-- Säkerhetsmodell:
--   * Kundskrivningar (skapa order, rapportera betalning) sker ENDAST via service_role-funktioner
--     som anropas från servern. anon/authenticated har inget EXECUTE på dem.
--   * Adminfunktioner är SECURITY INVOKER och kontrollerar public.is_admin() + RLS.
--   * Pengar är alltid heltal i öre.

-- ---------------------------------------------------------------------------
-- 1. Rättelse: product_images.variant_id används av katalogfrågan och produktsidan
--    men saknades i tidigare migrationer (frågan gav fel 42703 och tom katalog).
-- ---------------------------------------------------------------------------
alter table product_images add column if not exists variant_id uuid references product_variants(id) on delete set null;
create index if not exists product_images_variant_idx on product_images (variant_id);

-- ---------------------------------------------------------------------------
-- 2. Inställningar (frakt m.m.). Läses av create_order; skrivs av admin.
-- ---------------------------------------------------------------------------
create table if not exists shop_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table shop_settings enable row level security;
drop policy if exists "admin_all" on shop_settings;
create policy "admin_all" on shop_settings for all using (public.is_admin()) with check (public.is_admin());
-- Medvetet INGEN seed av fraktpris: ägaren måste ange det. Utan det öppnar kassan inte.

-- ---------------------------------------------------------------------------
-- 3. Utökade orderfält
-- ---------------------------------------------------------------------------
create sequence if not exists order_number_seq start 1000;

alter table orders
  add column if not exists order_number text,
  add column if not exists idempotency_key text,
  add column if not exists locale text not null default 'sv',
  add column if not exists discount_code text,
  add column if not exists updated_at timestamptz not null default now();

update orders set guest_token = gen_random_uuid() where guest_token is null;
alter table orders alter column guest_token set not null;
create unique index if not exists orders_guest_token_key on orders (guest_token);
create unique index if not exists orders_order_number_key on orders (order_number);
create unique index if not exists orders_idempotency_key_key on orders (idempotency_key);
create index if not exists orders_created_idx on orders (created_at desc);
create index if not exists orders_status_idx on orders (status);

alter table order_items
  add column if not exists variant_id uuid references product_variants(id) on delete set null,
  add column if not exists sku text,
  add column if not exists stock_reserved boolean not null default false;

alter table payments
  add column if not exists reference text,
  add column if not exists reported_at timestamptz,          -- kunden har klickat "Jag har betalat". Ändrar INTE status.
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references auth.users(id) on delete set null,
  add column if not exists verified_amount_ore int;
create unique index if not exists payments_order_key on payments (order_id);

-- ---------------------------------------------------------------------------
-- 4. Händelsehistorik, notislogg, lagerjusteringar
-- ---------------------------------------------------------------------------
create table if not exists order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  actor uuid,
  kind text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on order_events (order_id, created_at);

create table if not exists notification_log (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  kind text not null check (kind in ('order_created', 'payment_reported')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,                       -- aldrig webhook-URL eller andra hemligheter
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, kind)
);

create table if not exists stock_adjustments (
  id bigint generated always as identity primary key,
  product_id uuid not null references products(id) on delete cascade,
  delta int not null,
  reason text not null check (char_length(reason) between 3 and 300),
  actor uuid,
  created_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['order_events', 'notification_log', 'stock_adjustments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "admin_all" on %I', t);
    execute format('create policy "admin_all" on %I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. create_order: prissättning, lager, rabatt, frakt och order i EN transaktion.
--    Litar aldrig på pris/total från webbläsaren. Idempotent via p_idempotency_key.
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_idempotency_key text,
  p_user_id uuid,
  p_email text,
  p_locale text,
  p_shipping_address jsonb,
  p_items jsonb,
  p_discount_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing orders%rowtype;
  v_line record;
  v_prod products%rowtype;
  v_var product_variants%rowtype;
  v_inv inventory%rowtype;
  v_has_variants boolean;
  v_price int;
  v_name text;
  v_label text;
  v_sku text;
  v_vid uuid;
  v_reserved boolean;
  v_subtotal int := 0;
  v_discount int := 0;
  v_shipping int := 0;
  v_total int;
  v_ship jsonb;
  v_flat int;
  v_free_over int;
  v_disc discounts%rowtype;
  v_code text := nullif(trim(coalesce(p_discount_code, '')), '');
  v_order_id uuid;
  v_number text;
  v_token uuid;
  v_lines jsonb := '[]'::jsonb;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 80 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  -- Serialisera samtidiga anrop med samma nyckel (dubbelklick, omladdning, retry).
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select * into v_existing from orders where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('order_id', v_existing.id, 'order_number', v_existing.order_number,
      'guest_token', v_existing.guest_token, 'total_ore', v_existing.total_ore, 'created', false);
  end if;

  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(p_email) > 254 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if p_shipping_address is null or jsonb_typeof(p_shipping_address) <> 'object' then
    raise exception 'invalid_address' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 50 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  select value into v_ship from shop_settings where key = 'shipping';
  if v_ship is null or (v_ship->>'flat_ore') is null then
    raise exception 'shipping_not_configured' using errcode = 'P0001';
  end if;
  v_flat := (v_ship->>'flat_ore')::int;
  v_free_over := nullif(v_ship->>'free_over_ore', '')::int;

  v_order_id := gen_random_uuid();

  -- Aggregera dubbletter och gå igenom raderna i fast ordning (förhindrar deadlocks).
  for v_line in
    select (e->>'id')::uuid as id, sum((e->>'qty')::int)::int as qty
    from jsonb_array_elements(p_items) e
    group by 1
    order by 1
  loop
    if v_line.qty < 1 or v_line.qty > 99 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;

    v_vid := null; v_label := null; v_sku := null;
    select * into v_var from product_variants where id = v_line.id;
    if found then
      select * into v_prod from products where id = v_var.product_id for share;
      if not v_prod.active or not v_var.active then
        raise exception 'product_unavailable' using errcode = 'P0001', detail = v_prod.name_sv;
      end if;
      if not v_var.in_stock then
        raise exception 'out_of_stock' using errcode = 'P0001', detail = v_prod.name_sv || ' – ' || v_var.label;
      end if;
      v_vid := v_var.id; v_label := v_var.label; v_sku := coalesce(v_var.sku, v_prod.sku); v_price := v_var.price_ore;
    else
      select * into v_prod from products where id = v_line.id for share;
      if not found then
        raise exception 'product_unavailable' using errcode = 'P0001';
      end if;
      select exists (select 1 from product_variants where product_id = v_prod.id and active) into v_has_variants;
      if v_has_variants then
        -- Produkter med varianter måste köpas via en variant.
        raise exception 'variant_required' using errcode = 'P0001', detail = v_prod.name_sv;
      end if;
      if not v_prod.active then
        raise exception 'product_unavailable' using errcode = 'P0001', detail = v_prod.name_sv;
      end if;
      if not v_prod.in_stock then
        raise exception 'out_of_stock' using errcode = 'P0001', detail = v_prod.name_sv;
      end if;
      v_sku := v_prod.sku; v_price := v_prod.price_ore;
    end if;
    v_name := v_prod.name_sv;

    -- Lagerspårning är valfri per produkt: finns en inventory-rad gäller saldot, annars styr in_stock-flaggan.
    v_reserved := false;
    select * into v_inv from inventory where product_id = v_prod.id for update;
    if found then
      if v_inv.quantity - v_inv.reserved < v_line.qty then
        raise exception 'insufficient_stock' using errcode = 'P0001', detail = v_name;
      end if;
      update inventory set reserved = reserved + v_line.qty, updated_at = now() where product_id = v_prod.id;
      v_reserved := true;
    end if;

    v_subtotal := v_subtotal + v_price * v_line.qty;
    v_lines := v_lines || jsonb_build_object('product_id', v_prod.id, 'variant_id', v_vid, 'name', v_name,
      'variant', v_label, 'sku', v_sku, 'unit', v_price, 'qty', v_line.qty, 'reserved', v_reserved);
  end loop;

  if v_code is not null then
    select * into v_disc from discounts where lower(code) = lower(v_code) for update;
    if not found or not coalesce(v_disc.active, false)
       or (v_disc.expires_at is not null and v_disc.expires_at < now())
       or (v_disc.max_uses is not null and v_disc.used >= v_disc.max_uses) then
      raise exception 'invalid_discount' using errcode = 'P0001';
    end if;
    if v_disc.percent is not null then
      v_discount := (v_subtotal * v_disc.percent) / 100;
    elsif v_disc.amount_ore is not null then
      v_discount := least(v_disc.amount_ore, v_subtotal);
    end if;
    update discounts set used = used + 1 where id = v_disc.id;
  end if;

  if v_free_over is not null and (v_subtotal - v_discount) >= v_free_over then
    v_shipping := 0;
  else
    v_shipping := v_flat;
  end if;
  v_total := v_subtotal - v_discount + v_shipping;
  if v_total <= 0 then
    raise exception 'invalid_total' using errcode = 'P0001';
  end if;

  v_number := 'NS-' || to_char(now() at time zone 'Europe/Stockholm', 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0');

  insert into orders (id, user_id, email, locale, status, shipping_address, subtotal_ore, shipping_ore, discount_ore,
                      total_ore, order_number, idempotency_key, discount_code)
  values (v_order_id, p_user_id, lower(trim(p_email)), case when p_locale = 'en' then 'en' else 'sv' end, 'pending',
          p_shipping_address, v_subtotal, v_shipping, v_discount, v_total, v_number, p_idempotency_key,
          case when v_discount > 0 then v_code else null end)
  returning guest_token into v_token;

  insert into order_items (order_id, product_id, variant_id, name, variant, sku, unit_price_ore, quantity, stock_reserved)
  select v_order_id, (l->>'product_id')::uuid, nullif(l->>'variant_id', '')::uuid, l->>'name', l->>'variant', l->>'sku',
         (l->>'unit')::int, (l->>'qty')::int, (l->>'reserved')::boolean
  from jsonb_array_elements(v_lines) l;

  insert into payments (order_id, provider, status, amount_ore, reference)
  values (v_order_id, 'swish', 'initiated', v_total, v_number);

  insert into order_events (order_id, kind, detail)
  values (v_order_id, 'order_created', jsonb_build_object('total_ore', v_total, 'items', jsonb_array_length(v_lines)));

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_number, 'guest_token', v_token,
    'total_ore', v_total, 'created', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. report_payment: kunden rapporterar betalning. Ändrar ALDRIG betalningsstatus.
-- ---------------------------------------------------------------------------
create or replace function public.report_payment(p_guest_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_pay payments%rowtype;
begin
  select * into v_order from orders where guest_token = p_guest_token for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  select * into v_pay from payments where order_id = v_order.id for update;
  if v_order.status <> 'pending' or v_pay.status <> 'initiated' then
    return jsonb_build_object('order_id', v_order.id, 'first_report', false);
  end if;
  if v_pay.reported_at is not null then
    return jsonb_build_object('order_id', v_order.id, 'first_report', false);
  end if;
  update payments set reported_at = now() where id = v_pay.id;
  insert into order_events (order_id, kind, detail) values (v_order.id, 'payment_reported', null);
  return jsonb_build_object('order_id', v_order.id, 'first_report', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Notiskö (Discord): dedupe + retry. Ingen hemlighet lagras här.
-- ---------------------------------------------------------------------------
create or replace function public.claim_notification(p_order_id uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notification_log (order_id, kind, status, attempts)
  values (p_order_id, p_kind, 'pending', 1)
  on conflict (order_id, kind) do nothing;
  if found then
    return true;   -- vi skapade raden = vi äger utskicket
  end if;
  -- Befintlig rad: ta över endast om den misslyckats eller fastnat i 'pending' > 5 min.
  update notification_log
     set status = 'pending', attempts = attempts + 1, updated_at = now()
   where order_id = p_order_id and kind = p_kind
     and (status = 'failed' or (status = 'pending' and updated_at < now() - interval '5 minutes'));
  return found;
end;
$$;

create or replace function public.finish_notification(p_order_id uuid, p_kind text, p_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update notification_log
     set status = case when p_ok then 'sent' else 'failed' end,
         last_error = case when p_ok then null else left(p_error, 300) end,
         sent_at = case when p_ok then now() else sent_at end,
         updated_at = now()
   where order_id = p_order_id and kind = p_kind;
$$;

-- ---------------------------------------------------------------------------
-- 8. Adminfunktioner (SECURITY INVOKER: RLS + explicit adminkontroll)
-- ---------------------------------------------------------------------------
create or replace function public.admin_verify_payment(p_order_id uuid, p_received_ore int)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_pay payments%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  select * into v_pay from payments where order_id = p_order_id for update;
  if not found then raise exception 'payment_not_found' using errcode = 'P0002'; end if;
  if v_order.status <> 'pending' or v_pay.status <> 'initiated' then
    raise exception 'payment_not_pending' using errcode = 'P0001';
  end if;
  -- Admin måste själv ange beloppet som faktiskt kommit in; avvikelse stoppas.
  if p_received_ore is distinct from v_order.total_ore then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;

  update payments set status = 'paid', verified_at = now(), verified_by = auth.uid(), verified_amount_ore = p_received_ore
   where id = v_pay.id;
  update orders set status = 'paid', updated_at = now() where id = v_order.id;
  insert into order_events (order_id, actor, kind, detail)
  values (v_order.id, auth.uid(), 'payment_verified', jsonb_build_object('amount_ore', p_received_ore));
  insert into audit_logs (actor, action, target, meta)
  values (auth.uid(), 'order.payment_verified', v_order.id::text,
          jsonb_build_object('order_number', v_order.order_number, 'amount_ore', p_received_ore));
end;
$$;

create or replace function public.admin_update_order(p_order_id uuid, p_status order_status default null, p_tracking text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_item record;
  v_tracking text := nullif(trim(coalesce(p_tracking, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  if v_tracking is not null and char_length(v_tracking) > 80 then
    raise exception 'invalid_tracking' using errcode = '22023';
  end if;

  if p_status is not null and p_status <> v_order.status then
    -- 'paid' sätts bara av admin_verify_payment, 'refunded' bara av admin_register_refund.
    if not (
      (v_order.status = 'paid'    and p_status = 'packed') or
      (v_order.status = 'packed'  and p_status = 'shipped') or
      (v_order.status = 'shipped' and p_status = 'delivered') or
      (v_order.status in ('pending', 'paid', 'packed') and p_status = 'cancelled')
    ) then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;

    if p_status = 'shipped' then
      -- Skarpt saldo: dra av lagret och frigör reservationen.
      for v_item in select product_id, quantity from order_items where order_id = v_order.id and stock_reserved and product_id is not null loop
        update inventory set quantity = quantity - v_item.quantity, reserved = greatest(reserved - v_item.quantity, 0), updated_at = now()
         where product_id = v_item.product_id;
      end loop;
      update order_items set stock_reserved = false where order_id = v_order.id;
    elsif p_status = 'cancelled' then
      for v_item in select product_id, quantity from order_items where order_id = v_order.id and stock_reserved and product_id is not null loop
        update inventory set reserved = greatest(reserved - v_item.quantity, 0), updated_at = now() where product_id = v_item.product_id;
      end loop;
      update order_items set stock_reserved = false where order_id = v_order.id;
      update payments set status = 'cancelled' where order_id = v_order.id and status = 'initiated';
      if v_order.discount_code is not null then
        update discounts set used = greatest(used - 1, 0) where lower(code) = lower(v_order.discount_code);
      end if;
    end if;

    update orders set status = p_status, updated_at = now(), tracking_number = coalesce(v_tracking, tracking_number) where id = v_order.id;
    insert into order_events (order_id, actor, kind, detail)
    values (v_order.id, auth.uid(), 'status_changed', jsonb_build_object('from', v_order.status, 'to', p_status, 'tracking', v_tracking));
    insert into audit_logs (actor, action, target, meta)
    values (auth.uid(), 'order.status_changed', v_order.id::text, jsonb_build_object('order_number', v_order.order_number, 'from', v_order.status, 'to', p_status));
  elsif v_tracking is not null and v_tracking is distinct from v_order.tracking_number then
    update orders set tracking_number = v_tracking, updated_at = now() where id = v_order.id;
    insert into order_events (order_id, actor, kind, detail)
    values (v_order.id, auth.uid(), 'tracking_set', jsonb_build_object('tracking', v_tracking));
    insert into audit_logs (actor, action, target, meta)
    values (auth.uid(), 'order.tracking_set', v_order.id::text, jsonb_build_object('order_number', v_order.order_number));
  end if;
end;
$$;

-- Registrerar ENDAST en administrativ återbetalningsstatus. Ingen pengaöverföring sker här;
-- ägaren återbetalar manuellt i Swish/bank.
create or replace function public.admin_register_refund(p_order_id uuid, p_amount_ore int, p_note text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_pay payments%rowtype;
  v_item record;
  v_new int;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  select * into v_pay from payments where order_id = p_order_id for update;
  if not found or v_pay.status <> 'paid' then
    raise exception 'refund_requires_verified_payment' using errcode = 'P0001';
  end if;
  if p_amount_ore is null or p_amount_ore <= 0 or v_pay.refunded_ore + p_amount_ore > v_pay.amount_ore then
    raise exception 'invalid_refund_amount' using errcode = 'P0001';
  end if;
  v_new := v_pay.refunded_ore + p_amount_ore;
  update payments set refunded_ore = v_new, status = case when v_new = amount_ore then 'refunded' else status end where id = v_pay.id;
  if v_new = v_pay.amount_ore then
    -- Full återbetalning: frigör ev. fortfarande reserverat lager.
    for v_item in select product_id, quantity from order_items where order_id = v_order.id and stock_reserved and product_id is not null loop
      update inventory set reserved = greatest(reserved - v_item.quantity, 0), updated_at = now() where product_id = v_item.product_id;
    end loop;
    update order_items set stock_reserved = false where order_id = v_order.id;
    update orders set status = 'refunded', updated_at = now() where id = v_order.id;
  end if;
  insert into order_events (order_id, actor, kind, detail)
  values (v_order.id, auth.uid(), 'refund_registered',
          jsonb_build_object('amount_ore', p_amount_ore, 'total_refunded_ore', v_new, 'note', left(p_note, 300), 'administrative_only', true));
  insert into audit_logs (actor, action, target, meta)
  values (auth.uid(), 'order.refund_registered', v_order.id::text,
          jsonb_build_object('order_number', v_order.order_number, 'amount_ore', p_amount_ore));
end;
$$;

-- Lagerjustering med loggad orsak. Skapar inventory-rad vid första justeringen (= börja spåra saldo).
create or replace function public.admin_adjust_stock(p_product_id uuid, p_delta int, p_reason text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv inventory%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 or p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'invalid_adjustment' using errcode = '22023';
  end if;
  perform 1 from products where id = p_product_id;
  if not found then raise exception 'Product not found' using errcode = 'P0002'; end if;

  insert into inventory (product_id, quantity, reserved) values (p_product_id, 0, 0) on conflict (product_id) do nothing;
  select * into v_inv from inventory where product_id = p_product_id for update;
  if v_inv.quantity + p_delta < v_inv.reserved then
    -- Förhindrar negativa saldon och saldo under redan reserverade order.
    raise exception 'stock_below_reserved' using errcode = 'P0001';
  end if;
  update inventory set quantity = quantity + p_delta, updated_at = now() where product_id = p_product_id;
  insert into stock_adjustments (product_id, delta, reason, actor) values (p_product_id, p_delta, trim(p_reason), auth.uid());
  insert into audit_logs (actor, action, target, meta)
  values (auth.uid(), 'stock.adjusted', p_product_id::text, jsonb_build_object('delta', p_delta));
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. admin_save_product: bevara variant-ID:n (och därmed variantbilder och orderrader).
--    Tidigare version raderade och återskapade alla varianter vid varje sparning.
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_product(p_product jsonb, p_variants jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_variant jsonb;
  v_slug text;
  v_label text;
  v_found int;
  v_was_update boolean := nullif(p_product->>'id', '') is not null;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  v_slug := lower(trim(coalesce(p_product->>'slug', '')));
  if v_slug = '' or v_slug !~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$' then
    raise exception 'Invalid product slug' using errcode = '22023';
  end if;

  if not v_was_update then
    insert into products (
      slug, sku, category_id, name_sv, name_en, description_sv, description_en,
      price_ore, compare_price_ore, in_stock, active,
      seo_title_sv, seo_desc_sv, seo_title_en, seo_desc_en
    ) values (
      v_slug, nullif(p_product->>'sku', ''), nullif(p_product->>'category_id', '')::uuid,
      trim(p_product->>'name_sv'), nullif(trim(p_product->>'name_en'), ''),
      nullif(trim(p_product->>'description_sv'), ''), nullif(trim(p_product->>'description_en'), ''),
      (p_product->>'price_ore')::integer, nullif(p_product->>'compare_price_ore', '')::integer,
      coalesce((p_product->>'in_stock')::boolean, true), coalesce((p_product->>'active')::boolean, false),
      nullif(trim(p_product->>'seo_title_sv'), ''), nullif(trim(p_product->>'seo_desc_sv'), ''),
      nullif(trim(p_product->>'seo_title_en'), ''), nullif(trim(p_product->>'seo_desc_en'), '')
    ) returning id into v_id;
  else
    v_id := (p_product->>'id')::uuid;
    update products set
      slug = v_slug,
      sku = nullif(p_product->>'sku', ''),
      category_id = nullif(p_product->>'category_id', '')::uuid,
      name_sv = trim(p_product->>'name_sv'),
      name_en = nullif(trim(p_product->>'name_en'), ''),
      description_sv = nullif(trim(p_product->>'description_sv'), ''),
      description_en = nullif(trim(p_product->>'description_en'), ''),
      price_ore = (p_product->>'price_ore')::integer,
      compare_price_ore = nullif(p_product->>'compare_price_ore', '')::integer,
      in_stock = coalesce((p_product->>'in_stock')::boolean, true),
      active = coalesce((p_product->>'active')::boolean, false),
      seo_title_sv = nullif(trim(p_product->>'seo_title_sv'), ''),
      seo_desc_sv = nullif(trim(p_product->>'seo_desc_sv'), ''),
      seo_title_en = nullif(trim(p_product->>'seo_title_en'), ''),
      seo_desc_en = nullif(trim(p_product->>'seo_desc_en'), '')
    where id = v_id returning id into v_id;
    if v_id is null then
      raise exception 'Product not found' using errcode = 'P0002';
    end if;
  end if;

  -- Ta bort varianter som inte längre finns i listan (matchning på etikett, skiftlägesokänsligt).
  delete from product_variants
   where product_id = v_id
     and lower(label) <> all (
       select lower(trim(e->>'label')) from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) e
     );

  for v_variant in select value from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb))
  loop
    v_label := trim(v_variant->>'label');
    -- Utelämnad nyckel = behåll befintligt värde; skickad nyckel (även null/tom) = skriv över.
    update product_variants set
      sku = case when v_variant ? 'sku' then nullif(v_variant->>'sku', '') else sku end,
      price_ore = (v_variant->>'price_ore')::integer,
      compare_price_ore = case when v_variant ? 'compare_price_ore' then nullif(v_variant->>'compare_price_ore', '')::integer else compare_price_ore end,
      position = coalesce((v_variant->>'position')::integer, position),
      in_stock = coalesce((v_variant->>'in_stock')::boolean, in_stock),
      active = true,
      label = v_label
     where product_id = v_id and lower(label) = lower(v_label);
    get diagnostics v_found = row_count;
    if v_found = 0 then
      insert into product_variants (product_id, sku, label, price_ore, compare_price_ore, position, in_stock, active)
      values (
        v_id, nullif(v_variant->>'sku', ''), v_label, (v_variant->>'price_ore')::integer,
        nullif(v_variant->>'compare_price_ore', '')::integer, coalesce((v_variant->>'position')::integer, 0),
        coalesce((v_variant->>'in_stock')::boolean, true), true
      );
    end if;
  end loop;

  insert into audit_logs (actor, action, target, meta)
  values (
    auth.uid(),
    case when v_was_update then 'product.updated' else 'product.created' end,
    v_id::text,
    jsonb_build_object('slug', v_slug, 'variant_count', jsonb_array_length(coalesce(p_variants, '[]'::jsonb)))
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Behörigheter. EXECUTE är som standard öppet för PUBLIC (och i Supabase även anon/authenticated),
--     därför stängs de kundnära funktionerna uttryckligen.
-- ---------------------------------------------------------------------------
revoke all on function public.create_order(text, uuid, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.report_payment(uuid) from public, anon, authenticated;
revoke all on function public.claim_notification(uuid, text) from public, anon, authenticated;
revoke all on function public.finish_notification(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.create_order(text, uuid, text, text, jsonb, jsonb, text) to service_role;
grant execute on function public.report_payment(uuid) to service_role;
grant execute on function public.claim_notification(uuid, text) to service_role;
grant execute on function public.finish_notification(uuid, text, boolean, text) to service_role;

revoke all on function public.admin_verify_payment(uuid, int) from public, anon;
revoke all on function public.admin_update_order(uuid, order_status, text) from public, anon;
revoke all on function public.admin_register_refund(uuid, int, text) from public, anon;
revoke all on function public.admin_adjust_stock(uuid, int, text) from public, anon;
revoke all on function public.admin_save_product(jsonb, jsonb) from public, anon;
grant execute on function public.admin_verify_payment(uuid, int) to authenticated;
grant execute on function public.admin_update_order(uuid, order_status, text) to authenticated;
grant execute on function public.admin_register_refund(uuid, int, text) to authenticated;
grant execute on function public.admin_adjust_stock(uuid, int, text) to authenticated;
grant execute on function public.admin_save_product(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';

create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc)
  where user_id is not null;
create index if not exists order_items_order_idx on public.order_items(order_id);

-- The existing inventory row holds the shared balance and outstanding legacy reservations.
-- A variant with its own row uses only that balance. No shared quantities are inferred.
create table public.variant_inventory (
  variant_id uuid primary key references public.product_variants(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  reserved integer not null default 0 check (reserved between 0 and quantity),
  low_stock_threshold integer not null default 3 check (low_stock_threshold >= 0),
  updated_at timestamptz not null default now()
);
alter table public.variant_inventory enable row level security;
revoke all on public.variant_inventory from public, anon, authenticated, service_role;
grant select, insert, update on public.variant_inventory to authenticated;
grant select on public.variant_inventory to service_role;
create policy admin_all on public.variant_inventory for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create view public.stock_balances with (security_invoker = true) as
  select i.product_id, null::uuid as variant_id, i.quantity, i.reserved, i.low_stock_threshold
    from public.inventory i
  union all
  select v.product_id, i.variant_id, i.quantity, i.reserved, i.low_stock_threshold
    from public.variant_inventory i join public.product_variants v on v.id = i.variant_id;
revoke all on public.stock_balances from public, anon, authenticated, service_role;
grant select on public.stock_balances to authenticated, service_role;

alter table public.order_items
  add column inventory_variant_id uuid references public.variant_inventory(variant_id);
create index order_items_inventory_variant_idx on public.order_items(inventory_variant_id)
  where inventory_variant_id is not null;
alter table public.stock_adjustments
  add column variant_id uuid references public.product_variants(id) on delete set null;
create index stock_adjustments_variant_idx on public.stock_adjustments(variant_id)
  where variant_id is not null;

-- Counted units can be moved from the shared balance without touching open reservations.
create function public.admin_adjust_variant_stock(
  p_variant_id uuid, p_delta integer, p_reason text, p_transfer boolean default false
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_delta integer := p_delta;
  v_reason text := trim(p_reason);
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if v_delta is null or v_delta not between -100000 and 100000
     or p_transfer is null or (p_transfer and v_delta < 0)
     or v_reason is null or char_length(v_reason) not between 3 and 300 then
    raise exception 'invalid_adjustment' using errcode = '22023';
  end if;

  select p.id into v_product_id
  from public.products p join public.product_variants v on v.product_id = p.id
  where v.id = p_variant_id for no key update of p;
  if not found then raise exception 'variant_not_found' using errcode = 'P0002'; end if;

  if p_transfer and v_delta > 0 then
    update public.inventory
    set quantity = quantity - v_delta, updated_at = now()
    where product_id = v_product_id and quantity - reserved >= v_delta;
    if not found then
      raise exception 'insufficient_shared_stock' using errcode = 'P0001';
    end if;
    insert into public.stock_adjustments (product_id, delta, reason, actor)
      values (v_product_id, -v_delta, v_reason, auth.uid());
  end if;

  insert into public.variant_inventory (variant_id) values (p_variant_id)
    on conflict (variant_id) do nothing;
  update public.variant_inventory
  set quantity = quantity + v_delta, updated_at = now()
  where variant_id = p_variant_id and quantity::bigint + v_delta between reserved and 2147483647;
  if not found then
    raise exception 'stock_below_reserved' using errcode = 'P0001';
  end if;

  insert into public.stock_adjustments (product_id, variant_id, delta, reason, actor)
    values (v_product_id, p_variant_id, v_delta, v_reason, auth.uid());
  insert into public.audit_logs (actor, action, target, meta)
    values (auth.uid(), 'stock.adjusted', p_variant_id::text,
      jsonb_build_object('delta', v_delta, 'product_id', v_product_id, 'transferred_from_shared', p_transfer));
end;
$$;
revoke all on function public.admin_adjust_variant_stock(uuid, integer, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_adjust_variant_stock(uuid, integer, text, boolean) to authenticated;

-- Finalize each reservation against the balance that originally reserved it.
-- The trigger serves both manual order changes and automatic expiry.
create function private.settle_order_stock() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_shipped boolean := new.status = 'shipped';
begin
  perform p.id from public.products p
  where exists (select 1 from public.order_items i
    where i.order_id = new.id and i.stock_reserved and i.product_id = p.id)
  order by p.id for no key update;

  with lines as (
    select product_id, sum(quantity)::integer as qty
    from public.order_items
    where order_id = new.id and stock_reserved and inventory_variant_id is null
    group by product_id
  )
  update public.inventory i
  set quantity = i.quantity - case when v_shipped then lines.qty else 0 end,
      reserved = greatest(i.reserved - lines.qty, 0), updated_at = now()
  from lines where i.product_id = lines.product_id;

  with lines as (
    select inventory_variant_id, sum(quantity)::integer as qty
    from public.order_items
    where order_id = new.id and stock_reserved and inventory_variant_id is not null
    group by inventory_variant_id
  )
  update public.variant_inventory i
  set quantity = i.quantity - case when v_shipped then lines.qty else 0 end,
      reserved = i.reserved - lines.qty, updated_at = now()
  from lines where i.variant_id = lines.inventory_variant_id;

  update public.order_items set stock_reserved = false, inventory_variant_id = null
  where order_id = new.id and stock_reserved;
  return new;
end;
$$;
revoke all on function private.settle_order_stock() from public, anon, authenticated, service_role;
create trigger settle_order_stock before update of status on public.orders
  for each row when (old.status is distinct from new.status and new.status in ('shipped', 'cancelled', 'refunded'))
  execute function private.settle_order_stock();

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
  v_variant_stock variant_inventory%rowtype;
  v_inventory_variant_id uuid;
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
    if v_existing.user_id is distinct from p_user_id
       or (p_user_id is null and v_existing.email is distinct from lower(trim(p_email))) then
      raise exception 'invalid_idempotency_key' using errcode = '22023';
    end if;
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

  -- Lock stock scopes in product order. Transfers and order settlement use the same lock.
  perform p.id from products p
  where p.id in (
    select coalesce(v.product_id, (e->>'id')::uuid)
    from jsonb_array_elements(p_items) e
    left join product_variants v on v.id = (e->>'id')::uuid
  )
  order by p.id for no key update;

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
      select * into v_prod from products where id = v_var.product_id;
      if not v_prod.active or not v_var.active then
        raise exception 'product_unavailable' using errcode = 'P0001', detail = v_prod.name_sv;
      end if;
      if not v_var.in_stock then
        raise exception 'out_of_stock' using errcode = 'P0001', detail = v_prod.name_sv || ' – ' || v_var.label;
      end if;
      v_vid := v_var.id; v_label := v_var.label; v_sku := coalesce(v_var.sku, v_prod.sku); v_price := v_var.price_ore;
    else
      select * into v_prod from products where id = v_line.id;
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

    v_reserved := false;
    v_inventory_variant_id := null;
    select * into v_variant_stock from variant_inventory where variant_id = v_vid for update;
    if found then
      if v_variant_stock.quantity - v_variant_stock.reserved < v_line.qty then
        raise exception 'insufficient_stock' using errcode = 'P0001', detail = v_name || ' – ' || v_label;
      end if;
      update variant_inventory set reserved = reserved + v_line.qty, updated_at = now()
      where variant_id = v_vid;
      v_inventory_variant_id := v_vid;
      v_reserved := true;
    else
      select * into v_inv from inventory where product_id = v_prod.id for update;
      if found then
        if v_inv.quantity - v_inv.reserved < v_line.qty then
          raise exception 'insufficient_stock' using errcode = 'P0001', detail = concat_ws(' – ', v_name, v_label);
        end if;
        update inventory set reserved = reserved + v_line.qty, updated_at = now() where product_id = v_prod.id;
        v_reserved := true;
      end if;
    end if;

    v_subtotal := v_subtotal + v_price * v_line.qty;
    v_lines := v_lines || jsonb_build_object('product_id', v_prod.id, 'variant_id', v_vid, 'name', v_name,
      'variant', v_label, 'sku', v_sku, 'unit', v_price, 'qty', v_line.qty, 'reserved', v_reserved, 'inventory_variant_id', v_inventory_variant_id);
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

  insert into order_items (order_id, product_id, variant_id, name, variant, sku, unit_price_ore, quantity, stock_reserved, inventory_variant_id)
  select v_order_id, (l->>'product_id')::uuid, nullif(l->>'variant_id', '')::uuid, l->>'name', l->>'variant', l->>'sku',
         (l->>'unit')::int, (l->>'qty')::int, (l->>'reserved')::boolean, (l->>'inventory_variant_id')::uuid
  from jsonb_array_elements(v_lines) l;

  insert into payments (order_id, provider, status, amount_ore, reference)
  values (v_order_id, 'swish', 'initiated', v_total, v_number);

  insert into order_events (order_id, kind, detail)
  values (v_order_id, 'order_created', jsonb_build_object('total_ore', v_total, 'items', jsonb_array_length(v_lines)));

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_number, 'guest_token', v_token,
    'total_ore', v_total, 'created', true);
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
      (v_order.status = 'paid'    and p_status in ('packed', 'shipped')) or
      (v_order.status = 'packed'  and p_status = 'shipped') or
      (v_order.status = 'shipped' and p_status = 'delivered') or
      (v_order.status in ('pending', 'paid', 'packed') and p_status = 'cancelled')
    ) then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;

    update orders set status = p_status, updated_at = now(), tracking_number = coalesce(v_tracking, tracking_number) where id = v_order.id;
    if p_status = 'cancelled' then
      update payments set status = 'cancelled' where order_id = v_order.id and status = 'initiated';
      if v_order.discount_code is not null then
        update discounts set used = greatest(used - 1, 0) where lower(code) = lower(v_order.discount_code);
      end if;
    end if;

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


create or replace function public.admin_register_refund(p_order_id uuid, p_amount_ore int, p_note text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_pay payments%rowtype;
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

create or replace function private.expire_unpaid_orders(
  p_batch_size integer default 100,
  p_at timestamptz default now()
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order record;
  v_payment record;
  v_count integer := 0;
begin
  if p_batch_size is null or p_batch_size not between 1 and 500
     or p_at is null then
    raise exception 'invalid_expiry_parameters' using errcode = '22023';
  end if;

  -- Purge transient counters and old heartbeats regardless of the expiry switch.
  delete from private.rate_limit_buckets
    where expires_at < clock_timestamp() - interval '1 day';
  delete from public.system_job_runs
    where created_at < now() - interval '30 days';

  -- With manual Swish verification, never cancel without explicit owner opt-in.
  if not exists (select 1 from public.shop_settings
      where key = 'auto_expiry' and value->>'enabled' = 'true') then
    insert into public.system_job_runs (job_name, processed)
    values ('expire_unpaid_orders', 0);
    return 0;
  end if;

  -- Match the lock order used by admin_verify_payment and report_payment:
  -- lock order first, payment second. SKIP LOCKED supports concurrent workers.
  for v_order in
    select o.id, o.order_number, o.discount_code
    from public.orders o
    where o.status = 'pending'
      and o.created_at <= p_at - interval '24 hours'
      and exists (
        select 1 from public.payments p
        where p.order_id = o.id and p.status = 'initiated'
          and p.reported_at is null
      )
    order by o.created_at, o.id
    limit p_batch_size
    for update of o skip locked
  loop
    -- Recheck after acquiring the order lock. Payment reports and verification
    -- may have completed while waiting for the lock.
    select * into v_payment from public.payments
      where order_id = v_order.id for update;
    if not found or v_payment.status <> 'initiated'
       or v_payment.reported_at is not null then
      continue;
    end if;

    update public.orders set status = 'cancelled', updated_at = now()
      where id = v_order.id;
    update public.payments set status = 'cancelled' where id = v_payment.id;
    if v_order.discount_code is not null then
      update public.discounts set used = greatest(used - 1, 0)
      where lower(code) = lower(v_order.discount_code);
    end if;

    insert into public.order_events (order_id, kind, detail)
      values (v_order.id, 'status_changed',
        jsonb_build_object('from','pending','to','cancelled',
                           'reason','payment_timeout','timeout_minutes',1440));
    insert into public.audit_logs (actor, action, target, meta)
      values (null, 'order.expired', v_order.id::text,
        jsonb_build_object('order_number',v_order.order_number,'reason','payment_timeout'));
    v_count := v_count + 1;
  end loop;

  insert into public.system_job_runs (job_name, processed)
  values ('expire_unpaid_orders', v_count);
  return v_count;
end;
$$;

revoke all on function private.expire_unpaid_orders(integer,timestamptz)
  from public, anon, authenticated, service_role;


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
  v_variant_id uuid;
  v_seen uuid[] := array[]::uuid[];
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

  for v_variant in select value from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb))
  loop
    v_label := trim(v_variant->>'label');
    v_variant_id := nullif(v_variant->>'id', '')::uuid;
    if v_variant_id is null and not (v_variant ? 'id') then
      -- Older clients identified existing variants by label.
      select id into v_variant_id from product_variants
      where product_id = v_id and lower(label) = lower(v_label)
      order by active desc, position, id limit 1;
    end if;
    if v_variant_id = any(v_seen) then
      raise exception 'duplicate_variant' using errcode = '22023';
    end if;

    if v_variant_id is null then
      insert into product_variants (product_id, sku, label, price_ore, compare_price_ore, position, in_stock, active)
      values (
        v_id, nullif(v_variant->>'sku', ''), v_label, (v_variant->>'price_ore')::integer,
        nullif(v_variant->>'compare_price_ore', '')::integer, coalesce((v_variant->>'position')::integer, 0),
        coalesce((v_variant->>'in_stock')::boolean, true), coalesce((v_variant->>'active')::boolean, true)
      ) returning id into v_variant_id;
      insert into variant_inventory (variant_id) values (v_variant_id);
    else
      update product_variants set
        sku = case when v_variant ? 'sku' then nullif(v_variant->>'sku', '') else sku end,
        label = v_label,
        price_ore = (v_variant->>'price_ore')::integer,
        compare_price_ore = case when v_variant ? 'compare_price_ore' then nullif(v_variant->>'compare_price_ore', '')::integer else compare_price_ore end,
        position = coalesce((v_variant->>'position')::integer, position),
        in_stock = coalesce((v_variant->>'in_stock')::boolean, in_stock),
        active = coalesce((v_variant->>'active')::boolean, true)
      where product_id = v_id and id = v_variant_id;
      if not found then raise exception 'variant_not_found' using errcode = 'P0002'; end if;
    end if;
    v_seen := array_append(v_seen, v_variant_id);
  end loop;

  update product_variants set active = false
  where product_id = v_id and active and id <> all(v_seen);

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


-- Provision the catalog bucket on fresh Supabase projects.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('product-images', 'product-images', true) on conflict (id) do nothing;
  end if;
end;
$$;

create function public.admin_manage_variant_image(
  p_variant_id uuid, p_action text, p_image_id uuid default null,
  p_url text default null, p_alt_sv text default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_position integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select product_id into v_product_id
  from public.product_variants where id = p_variant_id for no key update;
  if not found then raise exception 'variant_not_found' using errcode = 'P0002'; end if;

  if p_action = 'add' then
    if p_url is null or p_url !~ '^https://[a-z0-9-]+[.]supabase[.]co/storage/v1/object/public/product-images/'
       or char_length(p_url) > 2048 or char_length(p_alt_sv) > 160 then
      raise exception 'invalid_image' using errcode = '22023';
    end if;
    if (select count(*) from public.product_images where variant_id = p_variant_id) >= 3 then
      raise exception 'variant_image_limit' using errcode = 'P0001';
    end if;
    select coalesce(max(position), 0) + 1 into v_position
    from public.product_images where variant_id = p_variant_id;
    insert into public.product_images (product_id, variant_id, url, position, alt_sv)
      values (v_product_id, p_variant_id, p_url, v_position, nullif(trim(p_alt_sv), ''));
  elsif p_action in ('cover', 'remove') then
    if not exists (select 1 from public.product_images
      where id = p_image_id and product_id = v_product_id and variant_id = p_variant_id) then
      raise exception 'image_not_found' using errcode = 'P0002';
    end if;
    if p_action = 'remove' then
      delete from public.product_images where id = p_image_id;
    else
      with positions as (
        select id, row_number() over (order by (id = p_image_id) desc, position nulls last, id) as position
        from public.product_images where variant_id = p_variant_id
      )
      update public.product_images i set position = p.position from positions p where p.id = i.id;
    end if;
  else
    raise exception 'invalid_image_action' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.admin_manage_variant_image(uuid, text, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_manage_variant_image(uuid, text, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

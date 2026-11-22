-- Sprint 02 (base: main / migrations through 0012).
-- Prepared for REVIEW ONLY. Never apply directly to production without staging tests.
-- Requires the Supabase Cron (pg_cron) extension; job runs every 5 minutes after applying.
-- Manual Swish reports are deliberately EXCLUDED from automatic cancellation.
-- Pending orders with a reported payment require human review.
-- The scheduler runs but cancellation stays opt-in after payment reconciliation.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Shared, bounded rate-limit counters. No unhashed email, IP or token is stored.
create table if not exists private.rate_limit_buckets (
  bucket_key text primary key check (bucket_key ~ '^[0-9a-f]{64}$'),
  attempts integer not null check (attempts > 0),
  expires_at timestamptz not null
);
alter table private.rate_limit_buckets enable row level security;
create index if not exists rate_limit_buckets_expiry_idx on private.rate_limit_buckets(expires_at);
revoke all on private.rate_limit_buckets from public, anon, authenticated, service_role;

-- Atomic fixed-window rate limiting. Only trusted server code (service_role) can call it.
-- SECURITY DEFINER is necessary to update a private table from service_role;
-- the key is already HMAC-hashed by the Next.js server.
create or replace function public.consume_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_attempts integer;
begin
  if p_bucket_key is null or p_bucket_key !~ '^[0-9a-f]{64}$'
     or p_limit is null or p_limit not between 1 and 1000
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid_rate_limit_parameters' using errcode = '22023';
  end if;
  insert into private.rate_limit_buckets (bucket_key, attempts, expires_at)
  values (p_bucket_key, 1, clock_timestamp() + make_interval(secs => p_window_seconds))
  on conflict (bucket_key) do update set
    attempts = case when private.rate_limit_buckets.expires_at <= clock_timestamp()
                    then 1 else private.rate_limit_buckets.attempts + 1 end,
    expires_at = case when private.rate_limit_buckets.expires_at <= clock_timestamp()
                      then clock_timestamp() + make_interval(secs => p_window_seconds)
                      else private.rate_limit_buckets.expires_at end
  returning attempts into v_attempts;
  return v_attempts <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;

-- Deploying this migration DOES NOT enable automatic cancellation.
insert into public.shop_settings (key, value)
values ('auto_expiry', '{"enabled":false}'::jsonb)
on conflict (key) do update set
  value = jsonb_set(public.shop_settings.value, '{enabled}', 'false'::jsonb),
  updated_at = now();

-- Readable only by admins. The cron function records a heartbeat even when no orders expire.
create table if not exists public.system_job_runs (
  id bigint generated always as identity primary key,
  job_name text not null,
  processed integer not null check (processed >= 0),
  created_at timestamptz not null default now()
);
create index if not exists system_job_runs_recent_idx on public.system_job_runs (job_name, created_at desc);
alter table public.system_job_runs enable row level security;
revoke all on public.system_job_runs from public, anon, authenticated, service_role;
grant select on public.system_job_runs to authenticated;
create policy "admin_read" on public.system_job_runs
  for select to authenticated using (public.is_admin());
create index if not exists orders_expiry_candidates_idx
  on public.orders (created_at, id) where status = 'pending';

-- Invoked only by pg_cron as its trusted database owner (postgres).
-- No API permissions or SECURITY DEFINER, no need for a public HTTP cron endpoint.
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
  v_item record;
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

    -- Release reservations exactly once (stock_reserved is cleared).
    for v_item in
      select product_id, sum(quantity)::integer as qty
      from public.order_items
      where order_id = v_order.id and stock_reserved and product_id is not null
      group by product_id
    loop
      update public.inventory
      set reserved = greatest(reserved - v_item.qty, 0), updated_at = now()
      where product_id = v_item.product_id;
    end loop;
    update public.order_items set stock_reserved = false
      where order_id = v_order.id and stock_reserved;
    update public.payments set status = 'cancelled' where id = v_payment.id;
    if v_order.discount_code is not null then
      update public.discounts set used = greatest(used - 1, 0)
      where lower(code) = lower(v_order.discount_code);
    end if;
    update public.orders set status = 'cancelled', updated_at = now()
      where id = v_order.id;

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

-- Supabase Cron is the scheduler, not Vercel or a public endpoint.
-- Applying schedules heartbeats but DOES NOT enable cancellation.
-- To enable after payment reconciliation, set shop_settings.auto_expiry.enabled=true.
-- Keep cron registration LAST: unsuccessful migration cannot install a partial job.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'northern-stingers-expire-unpaid-orders',
  '*/5 * * * *',
  'select private.expire_unpaid_orders(100);'
);

notify pgrst, 'reload schema';

-- 0010: e-postbekräftelser. Logg med dedupe och retry, samma mönster som notification_log (Discord).
create table if not exists email_log (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  kind text not null check (kind in ('order_confirmation', 'payment_verified', 'order_shipped')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  last_error text,                      -- aldrig API-nyckel eller mottagaradress
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, kind)
);
alter table email_log enable row level security;
drop policy if exists "admin_all" on email_log;
create policy "admin_all" on email_log for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.claim_email(p_order_id uuid, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into email_log (order_id, kind, status, attempts) values (p_order_id, p_kind, 'pending', 1)
  on conflict (order_id, kind) do nothing;
  if found then return true; end if;
  update email_log set status = 'pending', attempts = attempts + 1, updated_at = now()
   where order_id = p_order_id and kind = p_kind
     and (status = 'failed' or (status = 'pending' and updated_at < now() - interval '5 minutes'));
  return found;
end;
$$;

create or replace function public.finish_email(p_order_id uuid, p_kind text, p_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update email_log
     set status = case when p_ok then 'sent' else 'failed' end,
         last_error = case when p_ok then null else left(p_error, 300) end,
         sent_at = case when p_ok then now() else sent_at end,
         updated_at = now()
   where order_id = p_order_id and kind = p_kind;
$$;

revoke all on function public.claim_email(uuid, text) from public, anon, authenticated;
revoke all on function public.finish_email(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_email(uuid, text) to service_role;
grant execute on function public.finish_email(uuid, text, boolean, text) to service_role;

notify pgrst, 'reload schema';

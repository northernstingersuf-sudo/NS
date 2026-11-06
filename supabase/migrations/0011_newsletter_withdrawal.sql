-- Nyhetsbrev: dokumentera vilken samtyckestext/källa som användes och stöd avregistrering.
-- Gamla poster märks som legacy eftersom den exakta samtyckestexten inte lagrades historiskt.
alter table public.newsletter_subscribers
  add column if not exists consent_source text,
  add column if not exists consent_version text,
  add column if not exists consent_text text,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists unsubscribe_token uuid;

update public.newsletter_subscribers
set consent_source = coalesce(consent_source, 'legacy'),
    consent_version = coalesce(consent_version, 'legacy-unverified'),
    consent_text = coalesce(consent_text, 'legacy-not-recorded'),
    unsubscribe_token = coalesce(unsubscribe_token, gen_random_uuid())
where consent_source is null or consent_version is null or consent_text is null or unsubscribe_token is null;

alter table public.newsletter_subscribers
  alter column consent_source set default 'footer',
  alter column consent_source set not null,
  alter column consent_version set default '2026-11-06-v1',
  alter column consent_version set not null,
  alter column consent_text set default 'Jag samtycker till att Northern Stingers använder min e-postadress för att skicka nyheter och erbjudanden. Jag kan när som helst avregistrera mig.',
  alter column consent_text set not null,
  alter column unsubscribe_token set default gen_random_uuid(),
  alter column unsubscribe_token set not null;

create unique index if not exists newsletter_subscribers_unsubscribe_token_uidx
  on public.newsletter_subscribers (unsubscribe_token);
create index if not exists newsletter_subscribers_active_idx
  on public.newsletter_subscribers (consented_at desc)
  where unsubscribed_at is null;

-- Publika prenumerationer går via server action med rate limit och servernyckel.
-- Tabellen ska inte längre acceptera anonyma direkta INSERT-anrop via PostgREST.
drop policy if exists "anon_subscribe" on public.newsletter_subscribers;
revoke insert, update, delete on public.newsletter_subscribers from anon, authenticated;

-- Onlinefunktion för ångerrätt enligt distansavtalslagen 2 kap. 10 a § (i kraft 2026-06-19).
create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_number text not null,
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  customer_email text not null check (char_length(customer_email) <= 254),
  message text check (message is null or char_length(message) <= 2000),
  received_at timestamptz not null default now(),
  receipt_sent_at timestamptz,
  receipt_error text,
  status text not null default 'received' check (status in ('received', 'reviewed', 'closed'))
);

create index if not exists withdrawal_requests_received_idx
  on public.withdrawal_requests (received_at desc);
create index if not exists withdrawal_requests_order_idx
  on public.withdrawal_requests (order_id, received_at desc);

alter table public.withdrawal_requests enable row level security;
drop policy if exists "withdrawal_admin_all" on public.withdrawal_requests;
create policy "withdrawal_admin_all" on public.withdrawal_requests
  for all using (public.is_admin()) with check (public.is_admin());

comment on table public.withdrawal_requests is
  'Customer notices to withdraw from online purchases; the receipt email and timestamp are stored for compliance and admin handling.';
comment on column public.newsletter_subscribers.consent_version is
  'Version identifier for explicit newsletter consent wording. Legacy rows are marked legacy-unverified; exact text was not recorded for them.';
comment on column public.newsletter_subscribers.consent_text is
  'Exact consent wording shown to the subscriber at sign-up; legacy rows are marked legacy-not-recorded.';

notify pgrst, 'reload schema';

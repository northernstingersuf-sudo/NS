-- Double opt-in: new newsletter signups remain pending until the confirmation link is submitted.
alter table public.newsletter_subscribers
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmation_token uuid;

create unique index if not exists newsletter_subscribers_confirmation_token_uidx
  on public.newsletter_subscribers (confirmation_token)
  where confirmation_token is not null;

create index if not exists newsletter_subscribers_confirmed_active_idx
  on public.newsletter_subscribers (consented_at desc)
  where confirmed_at is not null and unsubscribed_at is null;

comment on column public.newsletter_subscribers.confirmed_at is
  'Timestamp when the subscriber completed double opt-in. Only confirmed, non-unsubscribed addresses may receive marketing email.';
comment on column public.newsletter_subscribers.confirmation_token is
  'Single-use token for newsletter double opt-in; cleared after confirmation.';

notify pgrst, 'reload schema';

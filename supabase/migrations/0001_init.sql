-- Northern Stingers: grundschema med RLS. Kör i Supabase SQL Editor eller via `supabase db push`.
create extension if not exists pgcrypto;

create type user_role as enum ('customer','admin');
create type order_status as enum ('pending','paid','packed','shipped','delivered','cancelled','refunded');
create type payment_status as enum ('initiated','paid','failed','cancelled','refunded');

create table categories (
  id uuid primary key default gen_random_uuid(), slug text unique not null,
  name_sv text not null, name_en text, position int default 0, active boolean default true
);
create table products (
  id uuid primary key default gen_random_uuid(), slug text unique not null, sku text unique,
  category_id uuid references categories(id) on delete set null,
  name_sv text not null, name_en text, description_sv text, description_en text,
  price_ore int not null check (price_ore >= 0), compare_price_ore int check (compare_price_ore >= 0),
  variants jsonb not null default '[]', in_stock boolean not null default true,
  seo_title_sv text, seo_desc_sv text, seo_title_en text, seo_desc_en text,
  active boolean not null default false, created_at timestamptz default now()
);
create table product_images (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references products(id) on delete cascade,
  url text not null, alt_sv text, alt_en text, position int default 0
);
create table inventory (
  product_id uuid primary key references products(id) on delete cascade,
  quantity int not null default 0 check (quantity >= 0), reserved int not null default 0 check (reserved >= 0),
  low_stock_threshold int default 3, updated_at timestamptz default now()
);
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, phone text, locale text default 'sv', role user_role not null default 'customer',
  created_at timestamptz default now()
);
create table orders (
  id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null,
  email text not null, guest_token uuid default gen_random_uuid(), status order_status not null default 'pending',
  shipping_address jsonb not null, subtotal_ore int not null, shipping_ore int not null default 0,
  discount_ore int not null default 0, total_ore int not null, tracking_number text, created_at timestamptz default now()
);
create table order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null, name text not null, variant text,
  unit_price_ore int not null, quantity int not null check (quantity > 0)
);
create table payments (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id) on delete cascade,
  provider text not null default 'swish', provider_ref text, status payment_status not null default 'initiated',
  amount_ore int not null, refunded_ore int not null default 0, created_at timestamptz default now()
);
create table reviews (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, rating int not null check (rating between 1 and 5),
  body text check (char_length(body) <= 2000), approved boolean not null default false, created_at timestamptz default now()
);
create table discounts (
  id uuid primary key default gen_random_uuid(), code text unique not null, percent int check (percent between 1 and 100),
  amount_ore int, active boolean default true, expires_at timestamptz, max_uses int, used int not null default 0
);
create table wishlists (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade, primary key (user_id, product_id)
);
create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(), email text unique not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  consented_at timestamptz default now()
);
create table audit_logs (
  id bigint generated always as identity primary key, actor uuid, action text not null, target text, meta jsonb,
  created_at timestamptz default now()
);
create table analytics_events (
  id bigint generated always as identity primary key, event text not null check (char_length(event) <= 64),
  path text check (char_length(path) <= 300), referrer text check (char_length(referrer) <= 300),
  utm jsonb, device text, session_id uuid, created_at timestamptz default now()
);

-- Admin-kontroll sker i databasen, aldrig i frontend.
create function public.is_admin() returns boolean language sql security definer stable set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as
$$ begin insert into profiles (id) values (new.id); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- RLS på allt
do $$ declare t text; begin
  foreach t in array array['categories','products','product_images','inventory','profiles','orders','order_items','payments',
    'reviews','discounts','wishlists','newsletter_subscribers','audit_logs','analytics_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "admin_all" on %I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Publik läsning
create policy "public_read" on categories for select using (active);
create policy "public_read" on products for select using (active);
create policy "public_read" on product_images for select using (exists (select 1 from products p where p.id = product_id and p.active));
create policy "public_read" on reviews for select using (approved);

-- Egna data
create policy "own_read" on profiles for select using (id = (select auth.uid()));
create policy "own_update" on profiles for update using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on profiles from authenticated;
grant update (full_name, phone, locale) on profiles to authenticated;   -- ingen kan göra sig själv till admin
create policy "own_read" on orders for select using (user_id = (select auth.uid()));
create policy "own_read" on order_items for select using (exists (select 1 from orders o where o.id = order_id and o.user_id = (select auth.uid())));
create policy "own_all" on wishlists for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own_insert" on reviews for insert with check (user_id = (select auth.uid()) and approved = false);

-- Anonym skrivning (smal)
create policy "anon_subscribe" on newsletter_subscribers for insert with check (true);
create policy "anon_event" on analytics_events for insert with check (true);

-- Orders, betalningar, lager och rabattkoder skrivs enbart av servern (service role). Inga publika skrivpolicyer finns.

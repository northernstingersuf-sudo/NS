create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku text unique, label text not null,
  price_ore int not null check (price_ore >= 0), compare_price_ore int check (compare_price_ore >= 0),
  position int not null default 0, in_stock boolean not null default true, active boolean not null default true
);
create index on product_variants (product_id);
alter table product_variants enable row level security;
create policy "public_read" on product_variants for select
  using (active and exists (select 1 from products p where p.id = product_id and p.active));
create policy "admin_all" on product_variants for all using (public.is_admin()) with check (public.is_admin());

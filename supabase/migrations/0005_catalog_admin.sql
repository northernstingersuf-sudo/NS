-- Northern Stingers: repeatable catalog correction + atomic admin product save.
-- Run after 0001_init.sql through 0004_seed_products.sql.

insert into categories (slug, name_sv, name_en, position, active) values
  ('stingers', 'Stingers', 'Stingers', 1, true),
  ('jiggskallar', 'Jiggskallar', 'Jig heads', 2, true),
  ('tafsar', 'Tafsar', 'Leaders', 3, true),
  ('tillbehor', 'Tillbehör', 'Accessories', 4, true)
on conflict (slug) do update set
  name_sv = excluded.name_sv,
  name_en = excluded.name_en,
  position = excluded.position,
  active = true;

insert into products (
  slug, sku, category_id, name_sv, name_en, description_sv, description_en,
  price_ore, compare_price_ore, variants, in_stock, active,
  seo_title_sv, seo_desc_sv, seo_title_en, seo_desc_en
)
select v.slug, v.sku, c.id, v.name_sv, v.name_en, v.description_sv, v.description_en,
       v.price_ore, null, '[]'::jsonb, true, true,
       v.name_sv || ' | Northern Stingers', left(v.description_sv, 155),
       v.name_en || ' | Northern Stingers', left(v.description_en, 155)
from (values
  ('kedje-stinger', 'NS-KS', 'stingers', 'Kedje Stinger', 'Chain Stinger',
   'En smidig kedjestinger för gäddfiske, framtagen för att komplettera ditt bete och ge en extra krokningmöjlighet. Finns i tre storlekar för att passa olika beten och riggningar.',
   'A practical chain stinger designed for pike fishing, complementing your lure with an additional hooking option. Available in three sizes to suit different lures and setups.', 2900),
  ('uv-kedje-stinger', 'NS-UKS', 'stingers', 'UV Kedje Stinger', 'UV Chain Stinger',
   'En UV-variant av vår kedjestinger för dig som vill ge betet en mer iögonfallande presentation. Ett spännande alternativ för gäddfiskare som vill variera sin riggning och testa nya detaljer.',
   'A UV version of our chain stinger, designed for anglers who want a more eye-catching lure presentation. A great option for pike anglers looking to experiment with different rigging styles.', 3500),
  ('jiggskallar-4-pack', 'NS-JS', 'jiggskallar', 'Jiggskallar 4-pack', 'Jig Heads 4-pack',
   'Praktiska jiggskallar för dina mjukbeten, perfekta när du vill anpassa fisket efter djup och förhållanden. Varje förpackning innehåller fyra jiggskallar och finns i två vikter för flexibel användning.',
   'Practical jig heads for your soft baits, ideal for adapting your fishing to different depths and conditions. Each pack contains four jig heads and is available in two weights for added versatility.', 3500),
  ('mono-gaddtafs-3-pack', 'NS-MT', 'tafsar', 'Mono Gäddtafs 3-pack', 'Mono Pike Leader 3-pack',
   'Pålitliga monotafsar för gäddfiske som ger en praktisk koppling mellan huvudlinan och betet. Levereras i 3-pack och finns i tre längder så att du kan välja det alternativ som passar ditt fiske bäst.',
   'Practical mono leaders for pike fishing, providing a dedicated connection between your main line and lure. Supplied in packs of three and available in three lengths to suit your fishing setup.', 2900),
  ('fiskevag-50-kg', 'NS-FV', 'tillbehor', 'Fiskevåg 50KG', 'Fishing Scale 50KG',
   'Håll koll på vikten av dina fångster med en praktisk fiskevåg med kapacitet upp till 50 kg. Ett användbart tillbehör för fisketuren när du vill väga och dokumentera dagens fångst.',
   'Keep track of your catches with a practical fishing scale featuring a capacity of up to 50 kg. A useful accessory for weighing and recording your catches on every fishing trip.', 19900)
) as v(slug, sku, category_slug, name_sv, name_en, description_sv, description_en, price_ore)
join categories c on c.slug = v.category_slug
on conflict (slug) do update set
  sku = excluded.sku,
  category_id = excluded.category_id,
  name_sv = excluded.name_sv,
  name_en = excluded.name_en,
  description_sv = excluded.description_sv,
  description_en = excluded.description_en,
  price_ore = excluded.price_ore,
  compare_price_ore = excluded.compare_price_ore,
  in_stock = excluded.in_stock,
  active = excluded.active,
  seo_title_sv = excluded.seo_title_sv,
  seo_desc_sv = excluded.seo_desc_sv,
  seo_title_en = excluded.seo_title_en,
  seo_desc_en = excluded.seo_desc_en;

-- Normalize only the variants belonging to the five sample products.
delete from product_variants
where product_id in (select id from products where slug in (
  'kedje-stinger', 'uv-kedje-stinger', 'jiggskallar-4-pack',
  'mono-gaddtafs-3-pack', 'fiskevag-50-kg'
));

insert into product_variants (product_id, sku, label, price_ore, position, in_stock, active)
select p.id, v.sku, v.label, v.price_ore, v.position, true, true
from (values
  ('kedje-stinger', 'NS-KS-S', 'SMALL', 2900, 1),
  ('kedje-stinger', 'NS-KS-M', 'MEDIUM', 3500, 2),
  ('kedje-stinger', 'NS-KS-L', 'LARGE', 3900, 3),
  ('uv-kedje-stinger', 'NS-UKS-S', 'SMALL', 3500, 1),
  ('uv-kedje-stinger', 'NS-UKS-M', 'MEDIUM', 3900, 2),
  ('uv-kedje-stinger', 'NS-UKS-L', 'LARGE', 4500, 3),
  ('jiggskallar-4-pack', 'NS-JS-7', '7G', 3500, 1),
  ('jiggskallar-4-pack', 'NS-JS-10', '10G', 3900, 2),
  ('mono-gaddtafs-3-pack', 'NS-MT-20', '20CM', 2900, 1),
  ('mono-gaddtafs-3-pack', 'NS-MT-30', '30CM', 3500, 2),
  ('mono-gaddtafs-3-pack', 'NS-MT-40', '40CM', 3900, 3)
) as v(product_slug, sku, label, price_ore, position)
join products p on p.slug = v.product_slug;

-- Called only by authenticated admins. SECURITY INVOKER means the caller's
-- grants and RLS still apply; this function additionally checks the admin role.
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
  v_was_update boolean := nullif(p_product->>'id', '') is not null;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  v_slug := lower(trim(coalesce(p_product->>'slug', '')));
  if v_slug = '' or v_slug !~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$' then
    raise exception 'Invalid product slug' using errcode = '22023';
  end if;

  if nullif(p_product->>'id', '') is null then
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

  delete from product_variants where product_id = v_id;
  for v_variant in select value from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb))
  loop
    insert into product_variants (
      product_id, sku, label, price_ore, compare_price_ore, position, in_stock, active
    ) values (
      v_id, nullif(v_variant->>'sku', ''), trim(v_variant->>'label'),
      (v_variant->>'price_ore')::integer, nullif(v_variant->>'compare_price_ore', '')::integer,
      coalesce((v_variant->>'position')::integer, 0),
      coalesce((v_variant->>'in_stock')::boolean, true), true
    );
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

revoke all on function public.admin_save_product(jsonb, jsonb) from public;
grant execute on function public.admin_save_product(jsonb, jsonb) to authenticated;

-- PostgREST can retain a stale relationship cache after a schema change.
notify pgrst, 'reload schema';

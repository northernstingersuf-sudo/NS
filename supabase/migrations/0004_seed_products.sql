-- Ersätter exempeldata från 0002 med de riktiga produkterna.
delete from products where slug = 'exempelprodukt';
delete from categories where slug in ('fiske','klader','livsstil');

insert into categories (slug, name_sv, name_en, position) values
  ('stingers','Stingers','Stingers',1), ('jiggskallar','Jiggskallar','Jig heads',2),
  ('tafsar','Tafsar','Leaders',3), ('tillbehor','Tillbehör','Accessories',4);

insert into products (slug, sku, category_id, name_sv, name_en, description_sv, description_en, price_ore, active)
select v.slug, v.sku, c.id, v.nsv, v.nen, v.dsv, v.den, v.price, true
from (values
 ('kedje-stinger','stingers','NS-KS','Kedje Stinger','Chain Stinger',
  'En smidig kedjestinger för gäddfiske, framtagen för att komplettera ditt bete och ge en extra krokningmöjlighet. Finns i tre storlekar för att passa olika beten och riggningar.',
  'A practical chain stinger designed for pike fishing, complementing your lure with an additional hooking option. Available in three sizes to suit different lures and setups.', 2900),
 ('uv-kedje-stinger','stingers','NS-UKS','UV Kedje Stinger','UV Chain Stinger',
  'En UV-variant av vår kedjestinger för dig som vill ge betet en mer iögonfallande presentation. Ett spännande alternativ för gäddfiskare som vill variera sin riggning och testa nya detaljer.',
  'A UV version of our chain stinger, designed for anglers who want a more eye-catching lure presentation. A great option for pike anglers looking to experiment with different rigging styles.', 3500),
 ('jiggskallar-4-pack','jiggskallar','NS-JS','Jiggskallar 4-pack','Jig Heads 4-pack',
  'Praktiska jiggskallar för dina mjukbeten, perfekta när du vill anpassa fisket efter djup och förhållanden. Varje förpackning innehåller fyra jiggskallar och finns i två vikter för flexibel användning.',
  'Practical jig heads for your soft baits, ideal for adapting your fishing to different depths and conditions. Each pack contains four jig heads and is available in two weights for added versatility.', 3500),
 ('mono-gaddtafs-3-pack','tafsar','NS-MT','Mono Gäddtafs 3-pack','Mono Pike Leader 3-pack',
  'Pålitliga monotafsar för gäddfiske som ger en praktisk koppling mellan huvudlinan och betet. Levereras i 3-pack och finns i tre längder så att du kan välja det alternativ som passar ditt fiske bäst.',
  'Practical mono leaders for pike fishing, providing a dedicated connection between your main line and lure. Supplied in packs of three and available in three lengths to suit your fishing setup.', 2900),
 ('fiskevag-50-kg','tillbehor','NS-FV','Fiskevåg 50 kg','Fishing Scale 50 kg',
  'Håll koll på vikten av dina fångster med en praktisk fiskevåg med kapacitet upp till 50 kg. Ett användbart tillbehör för fisketuren när du vill väga och dokumentera dagens fångst.',
  'Keep track of your catches with a practical fishing scale featuring a capacity of up to 50 kg. A useful accessory for weighing and recording your catches on every fishing trip.', 19900)
) as v(slug, cat, sku, nsv, nen, dsv, den, price)
join categories c on c.slug = v.cat;

insert into product_variants (product_id, sku, label, price_ore, position)
select p.id, v.sku, v.label, v.price, v.pos
from (values
 ('kedje-stinger','NS-KS-S','Small',2900,1), ('kedje-stinger','NS-KS-M','Medium',3500,2), ('kedje-stinger','NS-KS-L','Large',3900,3),
 ('uv-kedje-stinger','NS-UKS-S','Small',3500,1), ('uv-kedje-stinger','NS-UKS-M','Medium',3900,2), ('uv-kedje-stinger','NS-UKS-L','Large',4500,3),
 ('jiggskallar-4-pack','NS-JS-7','7 g',3500,1), ('jiggskallar-4-pack','NS-JS-10','10 g',3900,2),
 ('mono-gaddtafs-3-pack','NS-MT-20','20 cm',2900,1), ('mono-gaddtafs-3-pack','NS-MT-30','30 cm',3500,2), ('mono-gaddtafs-3-pack','NS-MT-40','40 cm',3900,3),
 ('fiskevag-50-kg','NS-FV-50','Standard',19900,1)
) as v(slug, sku, label, price, pos)
join products p on p.slug = v.slug;

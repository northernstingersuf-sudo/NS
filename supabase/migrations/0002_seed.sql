insert into categories (slug, name_sv, position) values ('fiske','Fiske',1), ('klader','Kläder',2), ('livsstil','Livsstil',3);
insert into products (slug, name_sv, description_sv, price_ore, category_id, active)
select 'exempelprodukt', 'Exempelprodukt', 'Ersätt med din första riktiga produkt.', 29900, id, true from categories where slug = 'fiske';

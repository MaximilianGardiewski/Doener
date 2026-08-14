-- Grants + RLS
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create policy "profile own insert" on public.profiles
for insert to authenticated with check (id = auth.uid());

create policy "profile own update" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "profile own or admin read" on public.profiles
for select to authenticated
using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "roles own or admin read" on public.user_roles
for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create policy "admins manage roles" on public.user_roles
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- Public/catalog tables
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'locations',
    'opening_hours',
    'special_opening_hours',
    'menu_categories',
    'menu_products',
    'modifier_groups',
    'modifier_options',
    'product_modifier_groups',
    'allergens',
    'product_allergens',
    'modifier_option_allergens',
    'availability_rules',
    'product_cross_sells',
    'editorial_posts',
    'homepage_sections'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

grant select on public.locations, public.opening_hours, public.special_opening_hours,
  public.menu_categories, public.menu_products, public.modifier_groups, public.modifier_options,
  public.product_modifier_groups, public.allergens, public.product_allergens,
  public.modifier_option_allergens, public.availability_rules, public.product_cross_sells,
  public.editorial_posts, public.homepage_sections
to anon, authenticated;

grant insert, update, delete on public.locations, public.opening_hours, public.special_opening_hours,
  public.menu_categories, public.menu_products, public.modifier_groups, public.modifier_options,
  public.product_modifier_groups, public.allergens, public.product_allergens,
  public.modifier_option_allergens, public.availability_rules, public.product_cross_sells,
  public.editorial_posts, public.homepage_sections
to authenticated;

create policy "locations public read" on public.locations for select to anon, authenticated using (active);
create policy "hours public read" on public.opening_hours for select to anon, authenticated using (true);
create policy "special hours public read" on public.special_opening_hours for select to anon, authenticated using (true);

create policy "categories public read" on public.menu_categories
for select to anon, authenticated using (status = 'published' and visible);

create policy "products public read" on public.menu_products
for select to anon, authenticated using (
  status = 'published'
  and exists (
    select 1 from public.menu_categories c
    where c.id = menu_products.category_id
      and c.status = 'published'
      and c.visible
  )
);

create policy "modifier groups public read" on public.modifier_groups
for select to anon, authenticated using (
  exists (
    select 1
    from public.product_modifier_groups pmg
    join public.menu_products p on p.id = pmg.product_id
    where pmg.group_id = modifier_groups.id and p.status = 'published'
  )
);

create policy "modifier options public read" on public.modifier_options
for select to anon, authenticated using (
  active and exists (
    select 1
    from public.modifier_groups mg
    join public.product_modifier_groups pmg on pmg.group_id = mg.id
    join public.menu_products p on p.id = pmg.product_id
    where mg.id = modifier_options.group_id and p.status = 'published'
  )
);

create policy "product modifier mapping public read" on public.product_modifier_groups
for select to anon, authenticated using (
  exists (select 1 from public.menu_products p where p.id = product_modifier_groups.product_id and p.status = 'published')
);

create policy "allergens public read" on public.allergens for select to anon, authenticated using (true);

create policy "product allergens public read" on public.product_allergens
for select to anon, authenticated using (
  exists (select 1 from public.menu_products p where p.id = product_allergens.product_id and p.status = 'published')
);

create policy "option allergens public read" on public.modifier_option_allergens
for select to anon, authenticated using (
  exists (
    select 1 from public.modifier_options o
    join public.modifier_groups g on g.id = o.group_id
    join public.product_modifier_groups pmg on pmg.group_id = g.id
    join public.menu_products p on p.id = pmg.product_id
    where o.id = modifier_option_allergens.option_id and p.status = 'published'
  )
);

create policy "availability public read" on public.availability_rules
for select to anon, authenticated using (enabled);

create policy "cross sells public read" on public.product_cross_sells
for select to anon, authenticated using (
  exists (select 1 from public.menu_products p where p.id = product_cross_sells.product_id and p.status = 'published')
  and exists (select 1 from public.menu_products p where p.id = product_cross_sells.suggested_product_id and p.status = 'published')
);

create policy "editorial public read" on public.editorial_posts
for select to anon, authenticated using (
  status = 'published'
  and (visible_from is null or visible_from <= now())
  and (visible_until is null or visible_until >= now())
);

create policy "homepage sections public read" on public.homepage_sections
for select to anon, authenticated using (enabled);

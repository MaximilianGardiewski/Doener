-- D057: keep Mcello's application UI single-location while making cross-table
-- location isolation a database invariant. Privileged/service writes must not
-- be able to connect records belonging to different locations.

do $$
begin
  if exists (
    select 1 from public.menu_products p
    join public.menu_categories c on c.id = p.category_id
    where p.location_id <> c.location_id
  ) then raise exception 'existing product/category rows cross a location boundary'; end if;

  if exists (
    select 1 from public.product_modifier_groups pmg
    join public.menu_products p on p.id = pmg.product_id
    join public.modifier_groups g on g.id = pmg.group_id
    where p.location_id <> g.location_id
  ) then raise exception 'existing product/modifier rows cross a location boundary'; end if;

  if exists (
    select 1 from public.availability_rules r
    left join public.menu_products p on p.id = r.product_id
    left join public.menu_categories c on c.id = r.category_id
    where coalesce(p.location_id, c.location_id) <> r.location_id
  ) then raise exception 'existing availability rows cross a location boundary'; end if;

  if exists (
    select 1 from public.snoozes s
    left join public.menu_products p on p.id = s.product_id
    left join public.modifier_options o on o.id = s.modifier_option_id
    left join public.modifier_groups g on g.id = o.group_id
    where coalesce(p.location_id, g.location_id) <> s.location_id
  ) then raise exception 'existing snooze rows cross a location boundary'; end if;

  if exists (
    select 1 from public.gallery_items g
    join public.media_assets m on m.id = g.media_id
    where g.location_id <> m.location_id
  ) then raise exception 'existing gallery/media rows cross a location boundary'; end if;

  if exists (
    select 1 from public.menu_products p
    join public.media_assets m on m.id = p.image_media_id
    where p.location_id <> m.location_id
  ) then raise exception 'existing product/media rows cross a location boundary'; end if;

  if exists (
    select 1 from public.editorial_posts p
    join public.media_assets m on m.id = p.image_media_id
    where p.location_id <> m.location_id
  ) then raise exception 'existing editorial/media rows cross a location boundary'; end if;

  if exists (
    select 1 from public.order_items i
    join public.orders o on o.id = i.order_id
    join public.menu_products p on p.id = i.product_id
    where o.location_id <> p.location_id
  ) then raise exception 'existing order/product rows cross a location boundary'; end if;

  if exists (
    select 1 from public.media_assets m
    where m.object_path not like m.location_id::text || '/%'
  ) then raise exception 'existing media path is outside its location prefix'; end if;

  if exists (
    select 1
    from public.analytics_events e
    left join public.menu_products p on p.id = e.product_id
    left join public.menu_products source on source.id = e.source_product_id
    left join public.cross_sell_rules r on r.id = e.cross_sell_rule_id
    left join public.orders o on o.id = e.order_id
    where (p.id is not null and p.location_id <> e.location_id)
       or (source.id is not null and source.location_id <> e.location_id)
       or (r.id is not null and r.location_id <> e.location_id)
       or (o.id is not null and o.location_id <> e.location_id)
  ) then raise exception 'existing analytics rows cross a location boundary'; end if;
end $$;

create or replace function public.prevent_location_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.location_id is distinct from old.location_id then
    raise exception 'location-scoped records cannot be reassigned to another location'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Keeping location identity immutable closes the reverse side of every
-- same-location relationship: a privileged writer cannot first create a valid
-- link and then move its category, product, group, media asset, order or event.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'opening_hours',
    'special_opening_hours',
    'ordering_settings',
    'menu_categories',
    'menu_products',
    'modifier_groups',
    'availability_rules',
    'snoozes',
    'orders',
    'editorial_posts',
    'homepage_sections',
    'cross_sell_rules',
    'media_assets',
    'gallery_items',
    'analytics_events'
  ]
  loop
    execute format(
      'create trigger prevent_location_reassignment before update of location_id on public.%I for each row execute function public.prevent_location_reassignment()',
      table_name
    );
  end loop;
end $$;

create or replace function public.enforce_location_boundary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'menu_products' then
    if not exists (
      select 1 from public.menu_categories c
      where c.id = new.category_id and c.location_id = new.location_id
    ) then
      raise exception 'product category must belong to product location'
        using errcode = 'foreign_key_violation';
    end if;
    if new.image_media_id is not null and not exists (
      select 1 from public.media_assets m
      where m.id = new.image_media_id and m.location_id = new.location_id
    ) then
      raise exception 'product image must belong to product location'
        using errcode = 'foreign_key_violation';
    end if;

  elsif tg_table_name = 'product_modifier_groups' then
    if not exists (
      select 1
      from public.menu_products p
      join public.modifier_groups g on g.id = new.group_id
      where p.id = new.product_id and p.location_id = g.location_id
    ) then
      raise exception 'product modifier group must belong to product location'
        using errcode = 'foreign_key_violation';
    end if;

  elsif tg_table_name = 'availability_rules' then
    if new.product_id is not null and not exists (
      select 1 from public.menu_products p
      where p.id = new.product_id and p.location_id = new.location_id
    ) then
      raise exception 'availability product must belong to rule location'
        using errcode = 'foreign_key_violation';
    end if;
    if new.category_id is not null and not exists (
      select 1 from public.menu_categories c
      where c.id = new.category_id and c.location_id = new.location_id
    ) then
      raise exception 'availability category must belong to rule location'
        using errcode = 'foreign_key_violation';
    end if;

  elsif tg_table_name = 'snoozes' then
    if new.product_id is not null and not exists (
      select 1 from public.menu_products p
      where p.id = new.product_id and p.location_id = new.location_id
    ) then
      raise exception 'snoozed product must belong to snooze location'
        using errcode = 'foreign_key_violation';
    end if;
    if new.modifier_option_id is not null and not exists (
      select 1
      from public.modifier_options o
      join public.modifier_groups g on g.id = o.group_id
      where o.id = new.modifier_option_id and g.location_id = new.location_id
    ) then
      raise exception 'snoozed modifier must belong to snooze location'
        using errcode = 'foreign_key_violation';
    end if;

  elsif tg_table_name = 'gallery_items' then
    if not exists (
      select 1 from public.media_assets m
      where m.id = new.media_id and m.location_id = new.location_id
    ) then
      raise exception 'gallery media must belong to gallery location'
        using errcode = 'foreign_key_violation';
    end if;

  elsif tg_table_name = 'editorial_posts' then
    if new.image_media_id is not null and not exists (
      select 1 from public.media_assets m
      where m.id = new.image_media_id and m.location_id = new.location_id
    ) then
      raise exception 'editorial image must belong to editorial location'
        using errcode = 'foreign_key_violation';
    end if;

  elsif tg_table_name = 'order_items' then
    if new.product_id is not null and not exists (
      select 1
      from public.orders o
      join public.menu_products p on p.id = new.product_id
      where o.id = new.order_id and o.location_id = p.location_id
    ) then
      raise exception 'order item product must belong to order location'
        using errcode = 'foreign_key_violation';
    end if;

  elsif tg_table_name = 'modifier_options' then
    if exists (
      select 1
      from public.modifier_groups g
      join public.snoozes s on s.modifier_option_id = new.id
      where g.id = new.group_id and g.location_id <> s.location_id
    ) or exists (
      select 1
      from public.modifier_groups g
      join public.cross_sell_rules r on r.trigger_modifier_option_id = new.id
      where g.id = new.group_id and g.location_id <> r.location_id
    ) then
      raise exception 'modifier option group must preserve dependent locations'
        using errcode = 'foreign_key_violation';
    end if;

  elsif tg_table_name = 'media_assets' then
    if new.object_path not like new.location_id::text || '/%' then
      raise exception 'media object path must start with its location id'
        using errcode = 'check_violation';
    end if;

  elsif tg_table_name = 'analytics_events' then
    if new.product_id is not null and not exists (
      select 1 from public.menu_products p
      where p.id = new.product_id and p.location_id = new.location_id
    ) then
      raise exception 'analytics product must belong to event location'
        using errcode = 'foreign_key_violation';
    end if;
    if new.source_product_id is not null and not exists (
      select 1 from public.menu_products p
      where p.id = new.source_product_id and p.location_id = new.location_id
    ) then
      raise exception 'analytics source product must belong to event location'
        using errcode = 'foreign_key_violation';
    end if;
    if new.cross_sell_rule_id is not null and not exists (
      select 1 from public.cross_sell_rules r
      where r.id = new.cross_sell_rule_id and r.location_id = new.location_id
    ) then
      raise exception 'analytics recommendation rule must belong to event location'
        using errcode = 'foreign_key_violation';
    end if;
    if new.order_id is not null and not exists (
      select 1 from public.orders o
      where o.id = new.order_id and o.location_id = new.location_id
    ) then
      raise exception 'analytics order must belong to event location'
        using errcode = 'foreign_key_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_menu_product_location
before insert or update of location_id, category_id, image_media_id on public.menu_products
for each row execute function public.enforce_location_boundary();

create trigger enforce_product_modifier_group_location
before insert or update on public.product_modifier_groups
for each row execute function public.enforce_location_boundary();

create trigger enforce_availability_rule_location
before insert or update of location_id, product_id, category_id on public.availability_rules
for each row execute function public.enforce_location_boundary();

create trigger enforce_snooze_location
before insert or update of location_id, product_id, modifier_option_id on public.snoozes
for each row execute function public.enforce_location_boundary();

create trigger enforce_gallery_item_location
before insert or update of location_id, media_id on public.gallery_items
for each row execute function public.enforce_location_boundary();

create trigger enforce_editorial_media_location
before insert or update of location_id, image_media_id on public.editorial_posts
for each row execute function public.enforce_location_boundary();

create trigger enforce_order_item_location
before insert or update of order_id, product_id on public.order_items
for each row execute function public.enforce_location_boundary();

create trigger enforce_modifier_option_location
before update of group_id on public.modifier_options
for each row execute function public.enforce_location_boundary();

create trigger enforce_media_path_location
before insert or update of location_id, object_path on public.media_assets
for each row execute function public.enforce_location_boundary();

create trigger enforce_analytics_event_location
before insert or update of location_id, product_id, source_product_id, cross_sell_rule_id, order_id
on public.analytics_events
for each row execute function public.enforce_location_boundary();

revoke all on function public.enforce_location_boundary() from public, anon, authenticated;
revoke all on function public.prevent_location_reassignment() from public, anon, authenticated;

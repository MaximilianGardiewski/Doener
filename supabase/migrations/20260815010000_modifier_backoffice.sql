-- Admin management for reusable ingredient/sauce/extra groups.
-- These are central definitions that can be attached to many products.

-- Admin clients should receive structural changes from other devices as well.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['modifier_groups', 'product_modifier_groups'] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;

create or replace function public.admin_get_catalog(_location_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();

  return jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'slug', c.slug,
          'name', c.name,
          'description', c.description,
          'sort', c.sort,
          'status', c.status,
          'visible', c.visible
        ) order by c.sort, c.name
      )
      from public.menu_categories c
      where c.location_id = _location_id
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'categoryId', p.category_id,
          'slug', p.slug,
          'name', p.name,
          'description', p.description,
          'basePriceCents', p.base_price_cents,
          'status', p.status,
          'bestseller', p.bestseller,
          'orderableOnline', p.orderable_online,
          'ownerConfirmed', p.owner_confirmed,
          'sort', p.sort,
          'modifierGroupIds', coalesce((
            select jsonb_agg(pmg.group_id order by pmg.sort, pmg.group_id)
            from public.product_modifier_groups pmg
            where pmg.product_id = p.id
          ), '[]'::jsonb),
          'soldOut', exists (
            select 1 from public.snoozes s
            where s.product_id = p.id and s.until_at > now()
          ),
          'snoozedUntil', (
            select max(s.until_at) from public.snoozes s
            where s.product_id = p.id and s.until_at > now()
          )
        ) order by p.sort, p.name
      )
      from public.menu_products p
      where p.location_id = _location_id
    ), '[]'::jsonb),
    'modifierGroups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'minSelections', g.min_selections,
          'maxSelections', g.max_selections,
          'sort', g.sort,
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', o.id,
                'name', o.name,
                'priceDeltaCents', o.price_delta_cents,
                'defaultSelected', o.default_selected,
                'active', o.active,
                'sort', o.sort,
                'soldOut', exists (
                  select 1 from public.snoozes s
                  where s.modifier_option_id = o.id and s.until_at > now()
                ),
                'snoozedUntil', (
                  select max(s.until_at) from public.snoozes s
                  where s.modifier_option_id = o.id and s.until_at > now()
                )
              ) order by o.sort, o.name
            )
            from public.modifier_options o
            where o.group_id = g.id
          ), '[]'::jsonb)
        ) order by g.sort, g.name
      )
      from public.modifier_groups g
      where g.location_id = _location_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_save_modifier_group(
  _id uuid,
  _location_id uuid,
  _name text,
  _min_selections integer,
  _max_selections integer,
  _sort integer
)
returns public.modifier_groups
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.modifier_groups;
begin
  perform public.require_admin();

  if coalesce(trim(_name), '') = '' then
    raise exception 'modifier group name is required' using errcode = 'check_violation';
  end if;
  if coalesce(_min_selections, 0) < 0 then
    raise exception 'minimum selections must be >= 0' using errcode = 'check_violation';
  end if;
  if _max_selections is null or _max_selections < coalesce(_min_selections, 0) then
    raise exception 'maximum selections must be >= minimum selections' using errcode = 'check_violation';
  end if;

  if _id is null then
    insert into public.modifier_groups(location_id, name, min_selections, max_selections, sort)
    values(
      _location_id,
      trim(_name),
      coalesce(_min_selections, 0),
      _max_selections,
      coalesce(_sort, 100)
    )
    returning * into saved;
  else
    update public.modifier_groups
    set name = trim(_name),
        min_selections = coalesce(_min_selections, 0),
        max_selections = _max_selections,
        sort = coalesce(_sort, 100)
    where id = _id and location_id = _location_id
    returning * into saved;
  end if;

  if saved.id is null then
    raise exception 'modifier group not found' using errcode = 'no_data_found';
  end if;

  if (
    select count(*)
    from public.modifier_options o
    where o.group_id = saved.id
      and o.active
      and o.default_selected
  ) > saved.max_selections then
    raise exception 'maximum selections is lower than the number of active default options' using errcode = 'check_violation';
  end if;

  return saved;
end;
$$;

create or replace function public.admin_save_modifier_option(
  _id uuid,
  _group_id uuid,
  _name text,
  _price_delta_cents integer,
  _default_selected boolean,
  _active boolean,
  _sort integer
)
returns public.modifier_options
language plpgsql
security definer
set search_path = public
as $$
declare
  target_group public.modifier_groups;
  saved public.modifier_options;
  defaults_after integer;
begin
  perform public.require_admin();

  select * into target_group
  from public.modifier_groups
  where id = _group_id;

  if target_group.id is null then
    raise exception 'modifier group not found' using errcode = 'no_data_found';
  end if;
  if coalesce(trim(_name), '') = '' then
    raise exception 'modifier option name is required' using errcode = 'check_violation';
  end if;
  if coalesce(_default_selected, false) and not coalesce(_active, true) then
    raise exception 'an inactive option cannot be selected by default' using errcode = 'check_violation';
  end if;

  select count(*) + case when coalesce(_default_selected, false) then 1 else 0 end
  into defaults_after
  from public.modifier_options o
  where o.group_id = _group_id
    and o.active
    and o.default_selected
    and (_id is null or o.id <> _id);

  if defaults_after > target_group.max_selections then
    raise exception 'too many default options for modifier group maximum' using errcode = 'check_violation';
  end if;

  if _id is null then
    insert into public.modifier_options(
      group_id, name, price_delta_cents, default_selected, active, sort
    ) values(
      _group_id,
      trim(_name),
      coalesce(_price_delta_cents, 0),
      coalesce(_default_selected, false),
      coalesce(_active, true),
      coalesce(_sort, 100)
    )
    returning * into saved;
  else
    update public.modifier_options
    set group_id = _group_id,
        name = trim(_name),
        price_delta_cents = coalesce(_price_delta_cents, 0),
        default_selected = coalesce(_default_selected, false),
        active = coalesce(_active, true),
        sort = coalesce(_sort, 100)
    where id = _id
      and exists (
        select 1
        from public.modifier_groups existing_group
        where existing_group.id = public.modifier_options.group_id
          and existing_group.location_id = target_group.location_id
      )
    returning * into saved;
  end if;

  if saved.id is null then
    raise exception 'modifier option not found' using errcode = 'no_data_found';
  end if;
  return saved;
end;
$$;

create or replace function public.admin_set_product_modifier_groups(
  _product_id uuid,
  _group_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  product_location uuid;
  requested_count integer;
  valid_count integer;
begin
  perform public.require_admin();

  select p.location_id into product_location
  from public.menu_products p
  where p.id = _product_id;

  if product_location is null then
    raise exception 'product not found' using errcode = 'no_data_found';
  end if;

  _group_ids := coalesce(_group_ids, '{}'::uuid[]);
  requested_count := cardinality(_group_ids);

  if requested_count <> (
    select count(distinct group_id)
    from unnest(_group_ids) as requested(group_id)
  ) then
    raise exception 'modifier group assignments must be unique' using errcode = 'check_violation';
  end if;

  select count(*) into valid_count
  from public.modifier_groups g
  where g.location_id = product_location
    and g.id = any(_group_ids);

  if valid_count <> requested_count then
    raise exception 'all modifier groups must belong to the product location' using errcode = 'foreign_key_violation';
  end if;

  delete from public.product_modifier_groups
  where product_id = _product_id;

  insert into public.product_modifier_groups(product_id, group_id, sort)
  select _product_id, requested.group_id, requested.ordinality::integer * 10
  from unnest(_group_ids) with ordinality as requested(group_id, ordinality);

  return jsonb_build_object(
    'productId', _product_id,
    'modifierGroupIds', to_jsonb(_group_ids)
  );
end;
$$;

revoke all on function public.admin_save_modifier_group(uuid,uuid,text,integer,integer,integer) from public, anon;
revoke all on function public.admin_save_modifier_option(uuid,uuid,text,integer,boolean,boolean,integer) from public, anon;
revoke all on function public.admin_set_product_modifier_groups(uuid,uuid[]) from public, anon;

grant execute on function public.admin_save_modifier_group(uuid,uuid,text,integer,integer,integer) to authenticated;
grant execute on function public.admin_save_modifier_option(uuid,uuid,text,integer,boolean,boolean,integer) to authenticated;
grant execute on function public.admin_set_product_modifier_groups(uuid,uuid[]) to authenticated;

-- Structured allergen + dietary-label management.
--
-- Important: this migration adds mechanics only. It does NOT seed or infer any
-- real Mcello allergen assignment. Business/legal content remains owner-confirmed.

-- Structural allergen changes should refresh open admin clients.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['allergens', 'product_allergens', 'modifier_option_allergens'] loop
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

create unique index if not exists allergens_code_ci_unique
on public.allergens (lower(code))
where code is not null and trim(code) <> '';

create unique index if not exists allergens_name_ci_unique
on public.allergens (lower(name));

create or replace function public.admin_validate_allergen_ids(_allergen_ids uuid[])
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ids uuid[] := coalesce(_allergen_ids, '{}'::uuid[]);
  requested_count integer;
  valid_count integer;
begin
  perform public.require_admin();
  requested_count := cardinality(ids);

  if requested_count <> (
    select count(distinct allergen_id)
    from unnest(ids) as requested(allergen_id)
  ) then
    raise exception 'allergen assignments must be unique' using errcode = 'check_violation';
  end if;

  select count(*) into valid_count
  from public.allergens a
  where a.id = any(ids);

  if valid_count <> requested_count then
    raise exception 'unknown allergen assignment' using errcode = 'foreign_key_violation';
  end if;

  return ids;
end;
$$;

create or replace function public.admin_normalize_dietary_tags(_tags text[])
returns text[]
language plpgsql
immutable
set search_path = public, pg_catalog
as $$
declare
  normalized text[];
begin
  if cardinality(coalesce(_tags, '{}'::text[])) > 20 then
    raise exception 'too many dietary tags' using errcode = 'check_violation';
  end if;

  select coalesce(array_agg(tag order by tag), '{}'::text[])
  into normalized
  from (
    select distinct lower(trim(raw_tag)) as tag
    from unnest(coalesce(_tags, '{}'::text[])) raw(raw_tag)
    where trim(raw_tag) <> ''
  ) normalized_tags;

  if exists (
    select 1 from unnest(normalized) tag
    where length(tag) > 32
      or tag !~ '^[a-z0-9][a-z0-9_-]*$'
  ) then
    raise exception 'dietary tags must be short stable keys (a-z, 0-9, _ or -)' using errcode = 'check_violation';
  end if;

  return normalized;
end;
$$;

create or replace function public.admin_save_allergen(
  _id uuid,
  _code text,
  _name text
)
returns public.allergens
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.allergens;
  normalized_code text := nullif(upper(trim(coalesce(_code, ''))), '');
  normalized_name text := trim(coalesce(_name, ''));
begin
  perform public.require_admin();

  if normalized_name = '' then
    raise exception 'allergen name is required' using errcode = 'check_violation';
  end if;
  if length(normalized_name) > 120 or (normalized_code is not null and length(normalized_code) > 32) then
    raise exception 'allergen code or name is too long' using errcode = 'check_violation';
  end if;

  if _id is null then
    insert into public.allergens(code, name)
    values(normalized_code, normalized_name)
    returning * into saved;
  else
    update public.allergens
    set code = normalized_code,
        name = normalized_name
    where id = _id
    returning * into saved;
  end if;

  if saved.id is null then
    raise exception 'allergen not found' using errcode = 'no_data_found';
  end if;
  return saved;
end;
$$;

create or replace function public.admin_set_product_allergens(
  _product_id uuid,
  _allergen_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
begin
  perform public.require_admin();
  if not exists (select 1 from public.menu_products p where p.id = _product_id) then
    raise exception 'product not found' using errcode = 'no_data_found';
  end if;

  ids := public.admin_validate_allergen_ids(_allergen_ids);

  delete from public.product_allergens where product_id = _product_id;
  insert into public.product_allergens(product_id, allergen_id)
  select _product_id, allergen_id
  from unnest(ids) allergen_id;

  return ids;
end;
$$;

create or replace function public.admin_set_modifier_option_allergens(
  _option_id uuid,
  _allergen_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  ids uuid[];
begin
  perform public.require_admin();
  if not exists (select 1 from public.modifier_options o where o.id = _option_id) then
    raise exception 'modifier option not found' using errcode = 'no_data_found';
  end if;

  ids := public.admin_validate_allergen_ids(_allergen_ids);

  delete from public.modifier_option_allergens where option_id = _option_id;
  insert into public.modifier_option_allergens(option_id, allergen_id)
  select _option_id, allergen_id
  from unnest(ids) allergen_id;

  return ids;
end;
$$;

-- Atomic product save: base fields + modifier group assignment + dietary tags +
-- structured allergens live in one transaction. A failed association rolls back
-- the underlying product create/update as well.
create or replace function public.admin_save_menu_product_configured(
  _id uuid,
  _location_id uuid,
  _category_id uuid,
  _slug text,
  _name text,
  _description text,
  _base_price_cents integer,
  _sort integer,
  _status public.content_status,
  _bestseller boolean,
  _orderable_online boolean,
  _owner_confirmed boolean,
  _modifier_group_ids uuid[],
  _dietary_tags text[],
  _allergen_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.menu_products;
  normalized_tags text[];
  allergen_ids uuid[];
begin
  perform public.require_admin();

  saved := public.admin_save_menu_product(
    _id,
    _location_id,
    _category_id,
    _slug,
    _name,
    _description,
    _base_price_cents,
    _sort,
    _status,
    _bestseller,
    _orderable_online,
    _owner_confirmed
  );

  normalized_tags := public.admin_normalize_dietary_tags(_dietary_tags);
  allergen_ids := public.admin_validate_allergen_ids(_allergen_ids);

  update public.menu_products
  set dietary_tags = normalized_tags
  where id = saved.id
  returning * into saved;

  perform public.admin_set_product_modifier_groups(saved.id, coalesce(_modifier_group_ids, '{}'::uuid[]));
  perform public.admin_set_product_allergens(saved.id, allergen_ids);

  return to_jsonb(saved) || jsonb_build_object(
    'modifierGroupIds', to_jsonb(coalesce(_modifier_group_ids, '{}'::uuid[])),
    'allergenIds', to_jsonb(allergen_ids),
    'dietaryTags', to_jsonb(normalized_tags)
  );
end;
$$;

-- Atomic option save: option fields + its allergen contribution.
create or replace function public.admin_save_modifier_option_configured(
  _id uuid,
  _group_id uuid,
  _name text,
  _price_delta_cents integer,
  _default_selected boolean,
  _active boolean,
  _sort integer,
  _allergen_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.modifier_options;
  allergen_ids uuid[];
begin
  perform public.require_admin();
  allergen_ids := public.admin_validate_allergen_ids(_allergen_ids);

  saved := public.admin_save_modifier_option(
    _id,
    _group_id,
    _name,
    _price_delta_cents,
    _default_selected,
    _active,
    _sort
  );

  perform public.admin_set_modifier_option_allergens(saved.id, allergen_ids);

  return to_jsonb(saved) || jsonb_build_object('allergenIds', to_jsonb(allergen_ids));
end;
$$;

-- Extend the admin catalog with structured labels/assignments. No unconfirmed
-- claims are generated; empty arrays stay empty until an admin explicitly saves.
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
    'allergens', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name)
        order by coalesce(a.code, ''), a.name
      )
      from public.allergens a
    ), '[]'::jsonb),
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
          'dietaryTags', to_jsonb(p.dietary_tags),
          'allergenIds', coalesce((
            select jsonb_agg(pa.allergen_id order by pa.allergen_id)
            from public.product_allergens pa
            where pa.product_id = p.id
          ), '[]'::jsonb),
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
                'allergenIds', coalesce((
                  select jsonb_agg(moa.allergen_id order by moa.allergen_id)
                  from public.modifier_option_allergens moa
                  where moa.option_id = o.id
                ), '[]'::jsonb),
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

-- Public menu exposes only explicitly assigned structured allergen data.
create or replace function public.get_public_menu(_location_id uuid, _at timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'locationId', _location_id,
    'generatedAt', _at,
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'slug', c.slug,
          'name', c.name,
          'description', c.description,
          'sort', c.sort,
          'products', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', p.id,
                'slug', p.slug,
                'name', p.name,
                'description', p.description,
                'basePriceCents', p.base_price_cents,
                'bestseller', p.bestseller,
                'orderableOnline', p.orderable_online,
                'ownerConfirmed', p.owner_confirmed,
                'dietaryTags', to_jsonb(p.dietary_tags),
                'allergens', coalesce((
                  select jsonb_agg(
                    jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name)
                    order by coalesce(a.code, ''), a.name
                  )
                  from public.product_allergens pa
                  join public.allergens a on a.id = pa.allergen_id
                  where pa.product_id = p.id
                ), '[]'::jsonb),
                'soldOut', exists (
                  select 1 from public.snoozes s
                  where s.product_id = p.id and s.until_at > _at
                ),
                'availableNow', case
                  when p.orderable_online then public.server_is_product_available(p.id, _at)
                  else false
                end,
                'modifierGroups', coalesce((
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', g.id,
                      'name', g.name,
                      'minSelections', g.min_selections,
                      'maxSelections', g.max_selections,
                      'options', coalesce((
                        select jsonb_agg(
                          jsonb_build_object(
                            'id', o.id,
                            'name', o.name,
                            'priceDeltaCents', o.price_delta_cents,
                            'defaultSelected', o.default_selected,
                            'allergens', coalesce((
                              select jsonb_agg(
                                jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name)
                                order by coalesce(a.code, ''), a.name
                              )
                              from public.modifier_option_allergens moa
                              join public.allergens a on a.id = moa.allergen_id
                              where moa.option_id = o.id
                            ), '[]'::jsonb),
                            'soldOut', exists (
                              select 1 from public.snoozes s
                              where s.modifier_option_id = o.id and s.until_at > _at
                            )
                          ) order by o.sort, o.id
                        )
                        from public.modifier_options o
                        where o.group_id = g.id and o.active
                      ), '[]'::jsonb)
                    ) order by pmg.sort, g.sort, g.id
                  )
                  from public.product_modifier_groups pmg
                  join public.modifier_groups g on g.id = pmg.group_id
                  where pmg.product_id = p.id
                ), '[]'::jsonb)
              ) order by p.sort, p.id
            )
            from public.menu_products p
            where p.location_id = _location_id
              and p.category_id = c.id
              and p.status = 'published'
          ), '[]'::jsonb)
        ) order by c.sort, c.id
      )
      from public.menu_categories c
      where c.location_id = _location_id
        and c.status = 'published'
        and c.visible
    ), '[]'::jsonb)
  )
$$;

-- Checkout gets the same structured facts so selected modifier allergens can be
-- derived without trusting browser-supplied metadata.
create or replace function public.server_get_checkout_product(_product_id uuid, _at timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'categoryId', p.category_id,
    'name', p.name,
    'description', p.description,
    'basePriceCents', p.base_price_cents,
    'bestseller', p.bestseller,
    'soldOut', exists (
      select 1 from public.snoozes s
      where s.product_id = p.id and s.until_at > _at
    ),
    'dietaryTags', to_jsonb(p.dietary_tags),
    'allergens', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name)
        order by coalesce(a.code, ''), a.name
      )
      from public.product_allergens pa
      join public.allergens a on a.id = pa.allergen_id
      where pa.product_id = p.id
    ), '[]'::jsonb),
    'ownerConfirmed', p.owner_confirmed,
    'sourceNote', p.source_note,
    'modifierGroups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'minSelections', g.min_selections,
          'maxSelections', g.max_selections,
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', o.id,
                'name', o.name,
                'priceDeltaCents', o.price_delta_cents,
                'defaultSelected', o.default_selected,
                'allergens', coalesce((
                  select jsonb_agg(
                    jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name)
                    order by coalesce(a.code, ''), a.name
                  )
                  from public.modifier_option_allergens moa
                  join public.allergens a on a.id = moa.allergen_id
                  where moa.option_id = o.id
                ), '[]'::jsonb),
                'soldOut', exists (
                  select 1 from public.snoozes s
                  where s.modifier_option_id = o.id and s.until_at > _at
                )
              ) order by o.sort, o.id
            )
            from public.modifier_options o
            where o.group_id = g.id and o.active
          ), '[]'::jsonb)
        ) order by pmg.sort, g.sort, g.id
      )
      from public.product_modifier_groups pmg
      join public.modifier_groups g on g.id = pmg.group_id
      where pmg.product_id = p.id
    ), '[]'::jsonb)
  )
  from public.menu_products p
  where p.id = _product_id
    and p.status = 'published'
    and p.orderable_online
$$;

revoke all on function public.admin_validate_allergen_ids(uuid[]) from public, anon;
revoke all on function public.admin_normalize_dietary_tags(text[]) from public, anon;
revoke all on function public.admin_save_allergen(uuid,text,text) from public, anon;
revoke all on function public.admin_set_product_allergens(uuid,uuid[]) from public, anon;
revoke all on function public.admin_set_modifier_option_allergens(uuid,uuid[]) from public, anon;
revoke all on function public.admin_save_menu_product_configured(uuid,uuid,uuid,text,text,text,integer,integer,public.content_status,boolean,boolean,boolean,uuid[],text[],uuid[]) from public, anon;
revoke all on function public.admin_save_modifier_option_configured(uuid,uuid,text,integer,boolean,boolean,integer,uuid[]) from public, anon;

grant execute on function public.admin_validate_allergen_ids(uuid[]) to authenticated;
grant execute on function public.admin_normalize_dietary_tags(text[]) to authenticated;
grant execute on function public.admin_save_allergen(uuid,text,text) to authenticated;
grant execute on function public.admin_set_product_allergens(uuid,uuid[]) to authenticated;
grant execute on function public.admin_set_modifier_option_allergens(uuid,uuid[]) to authenticated;
grant execute on function public.admin_save_menu_product_configured(uuid,uuid,uuid,text,text,text,integer,integer,public.content_status,boolean,boolean,boolean,uuid[],text[],uuid[]) to authenticated;
grant execute on function public.admin_save_modifier_option_configured(uuid,uuid,text,integer,boolean,boolean,integer,uuid[]) to authenticated;

-- Preserve existing public/server ACLs after CREATE OR REPLACE.
revoke all on function public.get_public_menu(uuid,timestamptz) from public;
grant execute on function public.get_public_menu(uuid,timestamptz) to anon, authenticated, service_role;
revoke all on function public.server_get_checkout_product(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.server_get_checkout_product(uuid,timestamptz) to service_role;

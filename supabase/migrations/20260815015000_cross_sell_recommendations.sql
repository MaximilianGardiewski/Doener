-- Mcello V1 D046: admin-curated product pairings plus deterministic
-- category/ingredient recommendation rules. No recommendation content is
-- seeded here; the owner remains the source of truth for actual pairings.

create table public.cross_sell_rules (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  trigger_category_id uuid references public.menu_categories(id) on delete cascade,
  trigger_modifier_option_id uuid references public.modifier_options(id) on delete cascade,
  suggested_category_id uuid references public.menu_categories(id) on delete cascade,
  suggested_product_id uuid references public.menu_products(id) on delete cascade,
  max_suggestions smallint not null default 3 check (max_suggestions between 1 and 6),
  sort integer not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(trigger_category_id, trigger_modifier_option_id) = 1),
  check (num_nonnulls(suggested_category_id, suggested_product_id) = 1)
);

create index product_cross_sells_suggested_product_idx
on public.product_cross_sells (suggested_product_id);

create index cross_sell_rules_location_enabled_sort_idx
on public.cross_sell_rules (location_id, enabled, sort, id);

create index cross_sell_rules_trigger_category_idx
on public.cross_sell_rules (trigger_category_id)
where trigger_category_id is not null;

create index cross_sell_rules_trigger_option_idx
on public.cross_sell_rules (trigger_modifier_option_id)
where trigger_modifier_option_id is not null;

create index cross_sell_rules_suggested_category_idx
on public.cross_sell_rules (suggested_category_id)
where suggested_category_id is not null;

create index cross_sell_rules_suggested_product_idx
on public.cross_sell_rules (suggested_product_id)
where suggested_product_id is not null;

create trigger touch_cross_sell_rules
before update on public.cross_sell_rules
for each row execute function public.touch_updated_at();

create or replace function public.enforce_product_cross_sell_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_location uuid;
  target_location uuid;
begin
  select p.location_id into source_location
  from public.menu_products p
  where p.id = new.product_id;

  select p.location_id into target_location
  from public.menu_products p
  where p.id = new.suggested_product_id;

  if source_location is null or target_location is null or source_location <> target_location then
    raise exception 'cross-sell products must belong to the same location'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger enforce_product_cross_sell_scope
before insert or update on public.product_cross_sells
for each row execute function public.enforce_product_cross_sell_scope();

do $$
begin
  if exists (
    select 1
    from public.product_cross_sells x
    join public.menu_products source on source.id = x.product_id
    join public.menu_products suggested on suggested.id = x.suggested_product_id
    where source.location_id <> suggested.location_id
  ) then
    raise exception 'existing cross-sell products cross a location boundary'
      using errcode = 'check_violation';
  end if;
end $$;

drop policy "cross sells public read" on public.product_cross_sells;
create policy "cross sells public read" on public.product_cross_sells
for select to anon, authenticated
using (
  exists (
    select 1
    from public.menu_products p
    join public.menu_categories c on c.id = p.category_id
    where p.id = product_cross_sells.product_id
      and p.status = 'published'
      and c.status = 'published'
      and c.visible
  )
  and exists (
    select 1
    from public.menu_products p
    join public.menu_categories c on c.id = p.category_id
    where p.id = product_cross_sells.suggested_product_id
      and p.status = 'published'
      and c.status = 'published'
      and c.visible
  )
);

create or replace function public.enforce_cross_sell_rule_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trigger_category_id is not null and not exists (
    select 1 from public.menu_categories c
    where c.id = new.trigger_category_id and c.location_id = new.location_id
  ) then
    raise exception 'cross-sell trigger category must belong to the location'
      using errcode = 'check_violation';
  end if;

  if new.trigger_modifier_option_id is not null and not exists (
    select 1
    from public.modifier_options o
    join public.modifier_groups g on g.id = o.group_id
    where o.id = new.trigger_modifier_option_id and g.location_id = new.location_id
  ) then
    raise exception 'cross-sell trigger option must belong to the location'
      using errcode = 'check_violation';
  end if;

  if new.suggested_category_id is not null and not exists (
    select 1 from public.menu_categories c
    where c.id = new.suggested_category_id and c.location_id = new.location_id
  ) then
    raise exception 'cross-sell target category must belong to the location'
      using errcode = 'check_violation';
  end if;

  if new.suggested_product_id is not null and not exists (
    select 1 from public.menu_products p
    where p.id = new.suggested_product_id and p.location_id = new.location_id
  ) then
    raise exception 'cross-sell target product must belong to the location'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger enforce_cross_sell_rule_scope
before insert or update on public.cross_sell_rules
for each row execute function public.enforce_cross_sell_rule_scope();

alter table public.cross_sell_rules enable row level security;

grant select, insert, update, delete on public.cross_sell_rules to authenticated;
grant all on public.cross_sell_rules to service_role;

create policy "admin manage cross sell rules" on public.cross_sell_rules
for all to authenticated
using ((select public.has_role((select auth.uid()), 'admin')))
with check ((select public.has_role((select auth.uid()), 'admin')));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'product_cross_sells'
    ) then
      alter publication supabase_realtime add table public.product_cross_sells;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'cross_sell_rules'
    ) then
      alter publication supabase_realtime add table public.cross_sell_rules;
    end if;
  end if;
end $$;

create or replace function public.admin_get_cross_sell_config(_location_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  return jsonb_build_object(
    'productCrossSells', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'productId', p.id,
          'suggestedProductIds', coalesce((
            select jsonb_agg(x.suggested_product_id order by x.sort, x.suggested_product_id)
            from public.product_cross_sells x
            where x.product_id = p.id
          ), '[]'::jsonb)
        ) order by p.sort, p.id
      )
      from public.menu_products p
      where p.location_id = _location_id
    ), '[]'::jsonb),
    'rules', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'name', r.name,
          'triggerCategoryId', r.trigger_category_id,
          'triggerModifierOptionId', r.trigger_modifier_option_id,
          'suggestedCategoryId', r.suggested_category_id,
          'suggestedProductId', r.suggested_product_id,
          'maxSuggestions', r.max_suggestions,
          'sort', r.sort,
          'enabled', r.enabled
        ) order by r.sort, r.id
      )
      from public.cross_sell_rules r
      where r.location_id = _location_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_set_product_cross_sells(
  _location_id uuid,
  _product_id uuid,
  _suggested_product_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[] := coalesce(_suggested_product_ids, '{}'::uuid[]);
  requested_count integer;
  valid_count integer;
begin
  perform public.require_admin();

  if not exists (
    select 1 from public.menu_products p
    where p.id = _product_id and p.location_id = _location_id
  ) then
    raise exception 'cross-sell source product not found' using errcode = 'no_data_found';
  end if;

  requested_count := cardinality(ids);
  if requested_count > 24 then
    raise exception 'too many curated cross-sells' using errcode = 'check_violation';
  end if;

  if requested_count <> (
    select count(distinct requested.id)
    from unnest(ids) as requested(id)
  ) then
    raise exception 'curated cross-sells must be unique' using errcode = 'check_violation';
  end if;

  if _product_id = any(ids) then
    raise exception 'a product cannot recommend itself' using errcode = 'check_violation';
  end if;

  select count(*) into valid_count
  from public.menu_products p
  where p.location_id = _location_id and p.id = any(ids);

  if valid_count <> requested_count then
    raise exception 'unknown or cross-location cross-sell product'
      using errcode = 'foreign_key_violation';
  end if;

  delete from public.product_cross_sells x where x.product_id = _product_id;
  insert into public.product_cross_sells(product_id, suggested_product_id, sort)
  select _product_id, requested.id, (requested.ordinality * 10)::integer
  from unnest(ids) with ordinality as requested(id, ordinality);

  return ids;
end;
$$;

create or replace function public.admin_save_cross_sell_rule(
  _id uuid,
  _location_id uuid,
  _name text,
  _trigger_category_id uuid,
  _trigger_modifier_option_id uuid,
  _suggested_category_id uuid,
  _suggested_product_id uuid,
  _max_suggestions integer,
  _sort integer,
  _enabled boolean
)
returns public.cross_sell_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.cross_sell_rules;
  normalized_name text := trim(coalesce(_name, ''));
begin
  perform public.require_admin();

  if length(normalized_name) not between 1 and 120 then
    raise exception 'cross-sell rule name is required and limited to 120 characters'
      using errcode = 'check_violation';
  end if;
  if num_nonnulls(_trigger_category_id, _trigger_modifier_option_id) <> 1 then
    raise exception 'cross-sell rule requires exactly one trigger'
      using errcode = 'check_violation';
  end if;
  if num_nonnulls(_suggested_category_id, _suggested_product_id) <> 1 then
    raise exception 'cross-sell rule requires exactly one target'
      using errcode = 'check_violation';
  end if;
  if coalesce(_max_suggestions, 0) not between 1 and 6 then
    raise exception 'cross-sell rule max suggestions must be between 1 and 6'
      using errcode = 'check_violation';
  end if;

  if _id is null then
    insert into public.cross_sell_rules(
      location_id, name, trigger_category_id, trigger_modifier_option_id,
      suggested_category_id, suggested_product_id, max_suggestions, sort, enabled
    ) values (
      _location_id, normalized_name, _trigger_category_id, _trigger_modifier_option_id,
      _suggested_category_id, _suggested_product_id, _max_suggestions,
      coalesce(_sort, 100), coalesce(_enabled, true)
    ) returning * into saved;
  else
    update public.cross_sell_rules
    set name = normalized_name,
        trigger_category_id = _trigger_category_id,
        trigger_modifier_option_id = _trigger_modifier_option_id,
        suggested_category_id = _suggested_category_id,
        suggested_product_id = _suggested_product_id,
        max_suggestions = _max_suggestions,
        sort = coalesce(_sort, 100),
        enabled = coalesce(_enabled, true)
    where id = _id and location_id = _location_id
    returning * into saved;
  end if;

  if saved.id is null then
    raise exception 'cross-sell rule not found' using errcode = 'no_data_found';
  end if;

  return saved;
end;
$$;

create or replace function public.admin_save_menu_product_recommended(
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
  _allergen_ids uuid[],
  _suggested_product_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved jsonb;
  product_id uuid;
  cross_sell_ids uuid[];
begin
  saved := public.admin_save_menu_product_configured(
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
    _owner_confirmed,
    _modifier_group_ids,
    _dietary_tags,
    _allergen_ids
  );

  product_id := (saved->>'id')::uuid;
  cross_sell_ids := public.admin_set_product_cross_sells(
    _location_id,
    product_id,
    _suggested_product_ids
  );

  return saved || jsonb_build_object('crossSellIds', to_jsonb(cross_sell_ids));
end;
$$;

create or replace function public.admin_delete_cross_sell_rule(
  _id uuid,
  _location_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  delete from public.cross_sell_rules r
  where r.id = _id and r.location_id = _location_id;

  if not found then
    raise exception 'cross-sell rule not found' using errcode = 'no_data_found';
  end if;

  return true;
end;
$$;

create or replace function public.get_public_cross_sells(_location_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'productCrossSells', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'productId', source.id,
          'suggestedProductIds', coalesce((
            select jsonb_agg(x.suggested_product_id order by x.sort, x.suggested_product_id)
            from public.product_cross_sells x
            join public.menu_products suggested on suggested.id = x.suggested_product_id
            join public.menu_categories suggested_category on suggested_category.id = suggested.category_id
            where x.product_id = source.id
              and suggested.location_id = _location_id
              and suggested.status = 'published'
              and suggested_category.status = 'published'
              and suggested_category.visible
          ), '[]'::jsonb)
        ) order by source.sort, source.id
      )
      from public.menu_products source
      join public.menu_categories source_category on source_category.id = source.category_id
      where source.location_id = _location_id
        and source.status = 'published'
        and source_category.status = 'published'
        and source_category.visible
        and exists (
          select 1 from public.product_cross_sells x where x.product_id = source.id
        )
    ), '[]'::jsonb),
    'crossSellRules', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'triggerCategoryId', r.trigger_category_id,
          'triggerModifierOptionId', r.trigger_modifier_option_id,
          'suggestedCategoryId', r.suggested_category_id,
          'suggestedProductId', r.suggested_product_id,
          'maxSuggestions', r.max_suggestions,
          'sort', r.sort
        ) order by r.sort, r.id
      )
      from public.cross_sell_rules r
      where r.location_id = _location_id
        and r.enabled
        and (
          (r.trigger_category_id is not null and exists (
            select 1 from public.menu_categories c
            where c.id = r.trigger_category_id
              and c.location_id = _location_id
              and c.status = 'published'
              and c.visible
          ))
          or
          (r.trigger_modifier_option_id is not null and exists (
            select 1
            from public.modifier_options o
            join public.modifier_groups g on g.id = o.group_id
            join public.product_modifier_groups pmg on pmg.group_id = g.id
            join public.menu_products p on p.id = pmg.product_id
            join public.menu_categories c on c.id = p.category_id
            where o.id = r.trigger_modifier_option_id
              and o.active
              and g.location_id = _location_id
              and p.status = 'published'
              and c.status = 'published'
              and c.visible
          ))
        )
        and (
          (r.suggested_category_id is not null and exists (
            select 1 from public.menu_categories c
            where c.id = r.suggested_category_id
              and c.location_id = _location_id
              and c.status = 'published'
              and c.visible
          ))
          or
          (r.suggested_product_id is not null and exists (
            select 1
            from public.menu_products p
            join public.menu_categories c on c.id = p.category_id
            where p.id = r.suggested_product_id
              and p.location_id = _location_id
              and p.status = 'published'
              and c.status = 'published'
              and c.visible
          ))
        )
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.enforce_product_cross_sell_scope() from public, anon, authenticated;
revoke all on function public.enforce_cross_sell_rule_scope() from public, anon, authenticated;
revoke all on function public.admin_get_cross_sell_config(uuid) from public, anon;
revoke all on function public.admin_set_product_cross_sells(uuid,uuid,uuid[]) from public, anon;
revoke all on function public.admin_save_cross_sell_rule(uuid,uuid,text,uuid,uuid,uuid,uuid,integer,integer,boolean) from public, anon;
revoke all on function public.admin_save_menu_product_recommended(uuid,uuid,uuid,text,text,text,integer,integer,public.content_status,boolean,boolean,boolean,uuid[],text[],uuid[],uuid[]) from public, anon;
revoke all on function public.admin_delete_cross_sell_rule(uuid,uuid) from public, anon;
revoke all on function public.get_public_cross_sells(uuid) from public;

grant execute on function public.admin_get_cross_sell_config(uuid) to authenticated;
grant execute on function public.admin_set_product_cross_sells(uuid,uuid,uuid[]) to authenticated;
grant execute on function public.admin_save_cross_sell_rule(uuid,uuid,text,uuid,uuid,uuid,uuid,integer,integer,boolean) to authenticated;
grant execute on function public.admin_save_menu_product_recommended(uuid,uuid,uuid,text,text,text,integer,integer,public.content_status,boolean,boolean,boolean,uuid[],text[],uuid[],uuid[]) to authenticated;
grant execute on function public.admin_delete_cross_sell_rule(uuid,uuid) to authenticated;
grant execute on function public.get_public_cross_sells(uuid) to anon, authenticated, service_role;

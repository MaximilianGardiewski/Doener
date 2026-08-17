-- Realtime + role-safe Mcello backoffice operations.
-- Realtime stays RLS-aware: clients subscribe with authenticated staff/admin JWTs.

-- Add operational tables to the Supabase Realtime publication idempotently.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'orders',
      'ordering_settings',
      'snoozes',
      'menu_products',
      'modifier_options'
    ] loop
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

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'admin role required' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.staff_get_operational_catalog(_location_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_staff();

  return jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'sort', c.sort
        ) order by c.sort, c.name
      )
      from public.menu_categories c
      where c.location_id = _location_id
        and c.status = 'published'
        and c.visible
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'categoryId', p.category_id,
          'name', p.name,
          'basePriceCents', p.base_price_cents,
          'orderableOnline', p.orderable_online,
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
        and p.status = 'published'
    ), '[]'::jsonb),
    'modifierGroups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', o.id,
                'name', o.name,
                'active', o.active,
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
            where o.group_id = g.id and o.active
          ), '[]'::jsonb)
        ) order by g.sort, g.name
      )
      from public.modifier_groups g
      where g.location_id = _location_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.staff_snooze_product(
  _product_id uuid,
  _until_at timestamptz,
  _reason text default 'Heute ausverkauft'
)
returns public.snoozes
language plpgsql
security definer
set search_path = public
as $$
declare
  product_location uuid;
  created public.snoozes;
begin
  perform public.require_staff();
  if _until_at is null or _until_at <= now() then
    raise exception 'snooze end must be in the future' using errcode = 'check_violation';
  end if;

  select location_id into product_location
  from public.menu_products
  where id = _product_id;
  if product_location is null then
    raise exception 'product not found' using errcode = 'no_data_found';
  end if;

  delete from public.snoozes
  where product_id = _product_id and until_at > now();

  insert into public.snoozes(location_id, product_id, until_at, reason, created_by)
  values(product_location, _product_id, _until_at, nullif(trim(_reason), ''), auth.uid())
  returning * into created;
  return created;
end;
$$;

create or replace function public.staff_unsnooze_product(_product_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  perform public.require_staff();
  delete from public.snoozes
  where product_id = _product_id and until_at > now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.staff_snooze_modifier_option(
  _option_id uuid,
  _until_at timestamptz,
  _reason text default 'Heute ausverkauft'
)
returns public.snoozes
language plpgsql
security definer
set search_path = public
as $$
declare
  option_location uuid;
  created public.snoozes;
begin
  perform public.require_staff();
  if _until_at is null or _until_at <= now() then
    raise exception 'snooze end must be in the future' using errcode = 'check_violation';
  end if;

  select g.location_id into option_location
  from public.modifier_options o
  join public.modifier_groups g on g.id = o.group_id
  where o.id = _option_id;
  if option_location is null then
    raise exception 'modifier option not found' using errcode = 'no_data_found';
  end if;

  delete from public.snoozes
  where modifier_option_id = _option_id and until_at > now();

  insert into public.snoozes(location_id, modifier_option_id, until_at, reason, created_by)
  values(option_location, _option_id, _until_at, nullif(trim(_reason), ''), auth.uid())
  returning * into created;
  return created;
end;
$$;

create or replace function public.staff_unsnooze_modifier_option(_option_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  perform public.require_staff();
  delete from public.snoozes
  where modifier_option_id = _option_id and until_at > now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

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
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_save_menu_category(
  _id uuid,
  _location_id uuid,
  _slug text,
  _name text,
  _description text,
  _sort integer,
  _status public.content_status,
  _visible boolean
)
returns public.menu_categories
language plpgsql
security definer
set search_path = public
as $$
declare saved public.menu_categories;
begin
  perform public.require_admin();
  if coalesce(trim(_slug), '') = '' or coalesce(trim(_name), '') = '' then
    raise exception 'category slug and name are required' using errcode = 'check_violation';
  end if;

  if _id is null then
    insert into public.menu_categories(location_id, slug, name, description, sort, status, visible)
    values(_location_id, trim(_slug), trim(_name), nullif(trim(_description), ''), coalesce(_sort, 100), _status, _visible)
    returning * into saved;
  else
    update public.menu_categories
    set slug = trim(_slug),
        name = trim(_name),
        description = nullif(trim(_description), ''),
        sort = coalesce(_sort, 100),
        status = _status,
        visible = _visible
    where id = _id and location_id = _location_id
    returning * into saved;
  end if;

  if saved.id is null then
    raise exception 'category not found' using errcode = 'no_data_found';
  end if;
  return saved;
end;
$$;

create or replace function public.admin_save_menu_product(
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
  _owner_confirmed boolean
)
returns public.menu_products
language plpgsql
security definer
set search_path = public
as $$
declare saved public.menu_products;
begin
  perform public.require_admin();
  if coalesce(trim(_slug), '') = '' or coalesce(trim(_name), '') = '' then
    raise exception 'product slug and name are required' using errcode = 'check_violation';
  end if;
  if _base_price_cents is null or _base_price_cents < 0 then
    raise exception 'valid product price is required' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.menu_categories c
    where c.id = _category_id and c.location_id = _location_id
  ) then
    raise exception 'category does not belong to location' using errcode = 'foreign_key_violation';
  end if;

  if _id is null then
    insert into public.menu_products(
      location_id, category_id, slug, name, description, base_price_cents,
      sort, status, bestseller, orderable_online, owner_confirmed
    ) values(
      _location_id, _category_id, trim(_slug), trim(_name), nullif(trim(_description), ''),
      _base_price_cents, coalesce(_sort, 100), _status, _bestseller,
      _orderable_online, _owner_confirmed
    ) returning * into saved;
  else
    update public.menu_products
    set category_id = _category_id,
        slug = trim(_slug),
        name = trim(_name),
        description = nullif(trim(_description), ''),
        base_price_cents = _base_price_cents,
        sort = coalesce(_sort, 100),
        status = _status,
        bestseller = _bestseller,
        orderable_online = _orderable_online,
        owner_confirmed = _owner_confirmed
    where id = _id and location_id = _location_id
    returning * into saved;
  end if;

  if saved.id is null then
    raise exception 'product not found' using errcode = 'no_data_found';
  end if;
  return saved;
end;
$$;

revoke all on function public.require_admin() from public, anon;
revoke all on function public.staff_get_operational_catalog(uuid) from public, anon;
revoke all on function public.staff_snooze_product(uuid,timestamptz,text) from public, anon;
revoke all on function public.staff_unsnooze_product(uuid) from public, anon;
revoke all on function public.staff_snooze_modifier_option(uuid,timestamptz,text) from public, anon;
revoke all on function public.staff_unsnooze_modifier_option(uuid) from public, anon;
revoke all on function public.admin_get_catalog(uuid) from public, anon;
revoke all on function public.admin_save_menu_category(uuid,uuid,text,text,text,integer,public.content_status,boolean) from public, anon;
revoke all on function public.admin_save_menu_product(uuid,uuid,uuid,text,text,text,integer,integer,public.content_status,boolean,boolean,boolean) from public, anon;

grant execute on function public.require_admin() to authenticated;
grant execute on function public.staff_get_operational_catalog(uuid) to authenticated;
grant execute on function public.staff_snooze_product(uuid,timestamptz,text) to authenticated;
grant execute on function public.staff_unsnooze_product(uuid) to authenticated;
grant execute on function public.staff_snooze_modifier_option(uuid,timestamptz,text) to authenticated;
grant execute on function public.staff_unsnooze_modifier_option(uuid) to authenticated;
grant execute on function public.admin_get_catalog(uuid) to authenticated;
grant execute on function public.admin_save_menu_category(uuid,uuid,text,text,text,integer,public.content_status,boolean) to authenticated;
grant execute on function public.admin_save_menu_product(uuid,uuid,uuid,text,text,text,integer,integer,public.content_status,boolean,boolean,boolean) to authenticated;

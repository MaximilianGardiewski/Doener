-- Narrow server-only read RPCs used by the checkout orchestrator.
-- They keep database-specific availability/opening-hour logic out of the domain package.

create or replace function public.server_get_checkout_product(_product_id uuid)
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
      where s.product_id = p.id and s.until_at > now()
    ),
    'dietaryTags', to_jsonb(p.dietary_tags),
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
                'soldOut', exists (
                  select 1 from public.snoozes s
                  where s.modifier_option_id = o.id and s.until_at > now()
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

create or replace function public.server_is_product_available(_product_id uuid, _at timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.menu_products;
  local_day date;
  local_time time;
  iso_weekday integer;
  has_rules boolean;
  rule_matches boolean;
begin
  select mp.* into p
  from public.menu_products mp
  where mp.id = _product_id
    and mp.status = 'published'
    and mp.orderable_online;

  if p.id is null then return false; end if;

  if exists (
    select 1 from public.snoozes s
    where s.product_id = p.id and s.until_at > _at
  ) then
    return false;
  end if;

  select
    (_at at time zone l.timezone)::date,
    (_at at time zone l.timezone)::time,
    extract(isodow from (_at at time zone l.timezone))::integer
  into local_day, local_time, iso_weekday
  from public.locations l where l.id = p.location_id;

  select exists (
    select 1 from public.availability_rules r
    where r.enabled
      and (r.product_id = p.id or r.category_id = p.category_id)
  ) into has_rules;

  if not has_rules then return true; end if;

  select exists (
    select 1 from public.availability_rules r
    where r.enabled
      and (r.product_id = p.id or r.category_id = p.category_id)
      and (r.weekday is null or r.weekday = iso_weekday)
      and (r.valid_from is null or r.valid_from <= local_day)
      and (r.valid_until is null or r.valid_until >= local_day)
      and (r.starts_at is null or r.starts_at <= local_time)
      and (r.ends_at is null or r.ends_at > local_time)
  ) into rule_matches;

  return rule_matches;
end;
$$;

create or replace function public.server_get_shop_state(_location_id uuid, _at timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  loc public.locations;
  settings public.ordering_settings;
  local_day date;
  local_time time;
  iso_weekday integer;
  scheduled_open boolean := false;
  close_time time;
  minutes_to_close integer;
  has_special boolean;
begin
  select * into loc from public.locations where id = _location_id and active;
  if loc.id is null then raise exception 'location not found' using errcode = 'no_data_found'; end if;
  select * into settings from public.ordering_settings where location_id = loc.id;
  if settings.location_id is null then raise exception 'ordering settings not found' using errcode = 'no_data_found'; end if;

  local_day := (_at at time zone loc.timezone)::date;
  local_time := (_at at time zone loc.timezone)::time;
  iso_weekday := extract(isodow from (_at at time zone loc.timezone))::integer;

  select exists (
    select 1 from public.special_opening_hours s where s.location_id = loc.id and s.day = local_day
  ) into has_special;

  if has_special then
    if exists (
      select 1 from public.special_opening_hours s
      where s.location_id = loc.id and s.day = local_day and s.closed
    ) then
      scheduled_open := false;
      close_time := null;
    else
      select min(s.closes_at)
      into close_time
      from public.special_opening_hours s
      where s.location_id = loc.id
        and s.day = local_day
        and not s.closed
        and s.opens_at <= local_time
        and s.closes_at > local_time;
      scheduled_open := close_time is not null;
    end if;
  else
    select min(h.closes_at)
    into close_time
    from public.opening_hours h
    where h.location_id = loc.id
      and h.weekday = iso_weekday
      and not h.closed
      and h.opens_at <= local_time
      and h.closes_at > local_time;
    scheduled_open := close_time is not null;
  end if;

  if scheduled_open and close_time is not null then
    minutes_to_close := greatest(0, floor(extract(epoch from (close_time - local_time)) / 60)::integer);
  else
    minutes_to_close := null;
  end if;

  return jsonb_build_object(
    'scheduledOpen', scheduled_open,
    'override', settings.override,
    'minutesUntilScheduledClose', minutes_to_close,
    'orderCutoffMinutes', settings.order_cutoff_minutes,
    'operatorMessage', settings.operator_message
  );
end;
$$;

create or replace function public.server_get_slot_capacity(_location_id uuid, _pickup_at timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  settings public.ordering_settings;
  occupied integer;
  slot_end timestamptz;
begin
  select * into settings from public.ordering_settings where location_id = _location_id;
  if settings.location_id is null then raise exception 'ordering settings not found' using errcode = 'no_data_found'; end if;

  slot_end := _pickup_at + make_interval(mins => settings.slot_minutes);

  select count(*)::integer into occupied
  from public.orders o
  where o.location_id = _location_id
    and o.state not in ('completed','rejected','cancelled')
    and (
      (o.state = 'waiting_for_acceptance' and o.requested_pickup_at >= _pickup_at and o.requested_pickup_at < slot_end)
      or
      (o.state <> 'waiting_for_acceptance' and o.accepted_pickup_at >= _pickup_at and o.accepted_pickup_at < slot_end)
    );

  return jsonb_build_object(
    'capacity', settings.slot_capacity,
    'acceptedOrderCount', occupied
  );
end;
$$;

revoke all on function public.server_get_checkout_product(uuid) from public, anon, authenticated;
revoke all on function public.server_is_product_available(uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.server_get_shop_state(uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.server_get_slot_capacity(uuid,timestamptz) from public, anon, authenticated;

grant execute on function public.server_get_checkout_product(uuid) to service_role;
grant execute on function public.server_is_product_available(uuid,timestamptz) to service_role;
grant execute on function public.server_get_shop_state(uuid,timestamptz) to service_role;
grant execute on function public.server_get_slot_capacity(uuid,timestamptz) to service_role;

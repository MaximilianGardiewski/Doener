-- Opening-hours, ordering-configuration and time-based availability backoffice.
-- No real Mcello hours are seeded here. Admins must explicitly confirm business data.

-- Schedule tables must refresh open admin clients across devices.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'opening_hours',
      'special_opening_hours',
      'availability_rules'
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

create or replace function public.admin_get_ordering_schedule(_location_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  loc public.locations;
begin
  perform public.require_admin();
  select * into loc from public.locations where id = _location_id;
  if loc.id is null then
    raise exception 'location not found' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'locationId', loc.id,
    'timezone', loc.timezone,
    'openingHours', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', h.id,
          'weekday', h.weekday,
          'opensAt', case when h.opens_at is null then null else to_char(h.opens_at, 'HH24:MI') end,
          'closesAt', case when h.closes_at is null then null else to_char(h.closes_at, 'HH24:MI') end,
          'closed', h.closed,
          'sort', h.sort
        ) order by h.weekday, h.sort, h.opens_at nulls first
      )
      from public.opening_hours h
      where h.location_id = _location_id
    ), '[]'::jsonb),
    'specialOpeningHours', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'day', s.day,
          'opensAt', case when s.opens_at is null then null else to_char(s.opens_at, 'HH24:MI') end,
          'closesAt', case when s.closes_at is null then null else to_char(s.closes_at, 'HH24:MI') end,
          'closed', s.closed,
          'publicNote', s.public_note
        ) order by s.day desc, s.opens_at nulls first
      )
      from public.special_opening_hours s
      where s.location_id = _location_id
    ), '[]'::jsonb),
    'orderingSettings', (
      select jsonb_build_object(
        'override', o.override,
        'operatorMessage', o.operator_message,
        'orderCutoffMinutes', o.order_cutoff_minutes,
        'acceptanceTimeoutMinutes', o.acceptance_timeout_minutes,
        'slotMinutes', o.slot_minutes,
        'slotCapacity', o.slot_capacity,
        'preparationLeadMinutes', o.preparation_lead_minutes,
        'onlineOrderingEnabled', o.online_ordering_enabled,
        'pickupEnabled', o.pickup_enabled,
        'deliveryEnabled', o.delivery_enabled
      )
      from public.ordering_settings o
      where o.location_id = _location_id
    ),
    'availabilityRules', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'productId', r.product_id,
          'productName', p.name,
          'categoryId', r.category_id,
          'categoryName', c.name,
          'weekday', r.weekday,
          'startsAt', case when r.starts_at is null then null else to_char(r.starts_at, 'HH24:MI') end,
          'endsAt', case when r.ends_at is null then null else to_char(r.ends_at, 'HH24:MI') end,
          'validFrom', r.valid_from,
          'validUntil', r.valid_until,
          'enabled', r.enabled
        ) order by coalesce(r.valid_from, date '0001-01-01') desc, r.weekday nulls first, r.starts_at nulls first
      )
      from public.availability_rules r
      left join public.menu_products p on p.id = r.product_id
      left join public.menu_categories c on c.id = r.category_id
      where r.location_id = _location_id
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'categoryId', p.category_id) order by p.name)
      from public.menu_products p
      where p.location_id = _location_id and p.status <> 'archived'
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
      from public.menu_categories c
      where c.location_id = _location_id and c.status <> 'archived'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_replace_weekly_opening_hours(
  _location_id uuid,
  _rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized jsonb := coalesce(_rows, '[]'::jsonb);
  invalid boolean;
  overlap_exists boolean;
begin
  perform public.require_admin();
  if not exists (select 1 from public.locations l where l.id = _location_id) then
    raise exception 'location not found' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(normalized) <> 'array' or jsonb_array_length(normalized) > 28 then
    raise exception 'opening-hours payload must be an array with at most 28 rows' using errcode = 'check_violation';
  end if;

  with parsed as (
    select
      (row->>'weekday')::integer as weekday,
      nullif(row->>'opensAt', '')::time as opens_at,
      nullif(row->>'closesAt', '')::time as closes_at,
      coalesce((row->>'closed')::boolean, false) as closed,
      coalesce((row->>'sort')::integer, ordinality::integer * 10) as sort
    from jsonb_array_elements(normalized) with ordinality as payload(row, ordinality)
  )
  select exists (
    select 1 from parsed
    where weekday not between 1 and 7
      or (closed and (opens_at is not null or closes_at is not null))
      or (not closed and (opens_at is null or closes_at is null or closes_at <= opens_at))
  ) into invalid;

  if invalid then
    raise exception 'invalid opening-hours row; open intervals must be same-day and closesAt > opensAt' using errcode = 'check_violation';
  end if;

  with parsed as (
    select
      (row->>'weekday')::integer as weekday,
      nullif(row->>'opensAt', '')::time as opens_at,
      nullif(row->>'closesAt', '')::time as closes_at,
      coalesce((row->>'closed')::boolean, false) as closed,
      ordinality::integer as n
    from jsonb_array_elements(normalized) with ordinality as payload(row, ordinality)
  )
  select exists (
    select 1
    from parsed a
    join parsed b on a.weekday = b.weekday and a.n < b.n
    where (a.closed or b.closed)
       or (not a.closed and not b.closed and a.opens_at < b.closes_at and b.opens_at < a.closes_at)
  ) into overlap_exists;

  if overlap_exists then
    raise exception 'opening-hours rows for one weekday may not overlap or mix closed and open rows' using errcode = 'check_violation';
  end if;

  delete from public.opening_hours where location_id = _location_id;

  insert into public.opening_hours(location_id, weekday, opens_at, closes_at, closed, sort)
  select
    _location_id,
    (row->>'weekday')::integer,
    nullif(row->>'opensAt', '')::time,
    nullif(row->>'closesAt', '')::time,
    coalesce((row->>'closed')::boolean, false),
    coalesce((row->>'sort')::integer, ordinality::integer * 10)
  from jsonb_array_elements(normalized) with ordinality as payload(row, ordinality);

  return jsonb_build_object('locationId', _location_id, 'rows', jsonb_array_length(normalized));
end;
$$;

create or replace function public.admin_save_special_opening_hour(
  _id uuid,
  _location_id uuid,
  _day date,
  _opens_at time,
  _closes_at time,
  _closed boolean,
  _public_note text
)
returns public.special_opening_hours
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.special_opening_hours;
begin
  perform public.require_admin();
  if _day is null then
    raise exception 'special day is required' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.locations l where l.id = _location_id) then
    raise exception 'location not found' using errcode = 'no_data_found';
  end if;
  if coalesce(_closed, false) then
    if _opens_at is not null or _closes_at is not null then
      raise exception 'closed special days cannot contain opening times' using errcode = 'check_violation';
    end if;
    delete from public.special_opening_hours
    where location_id = _location_id and day = _day and (_id is null or id <> _id);
  else
    if _opens_at is null or _closes_at is null or _closes_at <= _opens_at then
      raise exception 'special opening interval must be same-day with closesAt > opensAt' using errcode = 'check_violation';
    end if;
    delete from public.special_opening_hours
    where location_id = _location_id and day = _day and closed and (_id is null or id <> _id);
    if exists (
      select 1 from public.special_opening_hours s
      where s.location_id = _location_id
        and s.day = _day
        and not s.closed
        and (_id is null or s.id <> _id)
        and s.opens_at < _closes_at
        and _opens_at < s.closes_at
    ) then
      raise exception 'special opening intervals may not overlap' using errcode = 'check_violation';
    end if;
  end if;

  if _id is null then
    insert into public.special_opening_hours(location_id, day, opens_at, closes_at, closed, public_note)
    values(_location_id, _day, _opens_at, _closes_at, coalesce(_closed, false), nullif(trim(coalesce(_public_note, '')), ''))
    returning * into saved;
  else
    update public.special_opening_hours
    set day = _day,
        opens_at = _opens_at,
        closes_at = _closes_at,
        closed = coalesce(_closed, false),
        public_note = nullif(trim(coalesce(_public_note, '')), '')
    where id = _id and location_id = _location_id
    returning * into saved;
  end if;

  if saved.id is null then
    raise exception 'special opening-hour row not found' using errcode = 'no_data_found';
  end if;
  return saved;
end;
$$;

create or replace function public.admin_delete_special_opening_hour(_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  perform public.require_admin();
  delete from public.special_opening_hours where id = _id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.admin_save_ordering_settings(
  _location_id uuid,
  _order_cutoff_minutes integer,
  _acceptance_timeout_minutes integer,
  _slot_minutes integer,
  _slot_capacity integer,
  _preparation_lead_minutes integer,
  _online_ordering_enabled boolean,
  _pickup_enabled boolean,
  _delivery_enabled boolean
)
returns public.ordering_settings
language plpgsql
security definer
set search_path = public
as $$
declare saved public.ordering_settings;
begin
  perform public.require_admin();
  if _order_cutoff_minutes not between 0 and 240
     or _acceptance_timeout_minutes not between 1 and 60
     or _slot_minutes not between 5 and 120
     or _slot_capacity is null or _slot_capacity <= 0
     or _preparation_lead_minutes not between 0 and 240 then
    raise exception 'invalid ordering settings' using errcode = 'check_violation';
  end if;

  update public.ordering_settings
  set order_cutoff_minutes = _order_cutoff_minutes,
      acceptance_timeout_minutes = _acceptance_timeout_minutes,
      slot_minutes = _slot_minutes,
      slot_capacity = _slot_capacity,
      preparation_lead_minutes = _preparation_lead_minutes,
      online_ordering_enabled = coalesce(_online_ordering_enabled, true),
      pickup_enabled = coalesce(_pickup_enabled, true),
      delivery_enabled = coalesce(_delivery_enabled, false)
  where location_id = _location_id
  returning * into saved;

  if saved.location_id is null then
    raise exception 'ordering settings not found' using errcode = 'no_data_found';
  end if;
  return saved;
end;
$$;

create or replace function public.staff_set_shop_override(
  _location_id uuid,
  _override public.shop_override,
  _operator_message text default null
)
returns public.ordering_settings
language plpgsql
security definer
set search_path = public
as $$
declare saved public.ordering_settings;
begin
  perform public.require_staff();
  if _override not in ('auto'::public.shop_override, 'force_closed'::public.shop_override, 'pause'::public.shop_override, 'today_closed'::public.shop_override) then
    raise exception 'staff may only close/pause ordering or return it to automatic mode' using errcode = 'insufficient_privilege';
  end if;
  if length(coalesce(_operator_message, '')) > 180 then
    raise exception 'operator message is too long' using errcode = 'check_violation';
  end if;

  update public.ordering_settings
  set override = _override,
      operator_message = nullif(trim(coalesce(_operator_message, '')), '')
  where location_id = _location_id
  returning * into saved;

  if saved.location_id is null then
    raise exception 'ordering settings not found' using errcode = 'no_data_found';
  end if;
  return saved;
end;
$$;

create or replace function public.admin_save_availability_rule(
  _id uuid,
  _location_id uuid,
  _product_id uuid,
  _category_id uuid,
  _weekday integer,
  _starts_at time,
  _ends_at time,
  _valid_from date,
  _valid_until date,
  _enabled boolean
)
returns public.availability_rules
language plpgsql
security definer
set search_path = public
as $$
declare saved public.availability_rules;
begin
  perform public.require_admin();
  if (_product_id is null) = (_category_id is null) then
    raise exception 'exactly one availability target is required' using errcode = 'check_violation';
  end if;
  if _weekday is not null and _weekday not between 1 and 7 then
    raise exception 'weekday must be between 1 and 7' using errcode = 'check_violation';
  end if;
  if (_starts_at is null) <> (_ends_at is null) then
    raise exception 'startsAt and endsAt must both be set or both be null' using errcode = 'check_violation';
  end if;
  if _starts_at is not null and _ends_at <= _starts_at then
    raise exception 'availability time range must be same-day with endsAt > startsAt' using errcode = 'check_violation';
  end if;
  if _valid_from is not null and _valid_until is not null and _valid_until < _valid_from then
    raise exception 'validUntil must be on or after validFrom' using errcode = 'check_violation';
  end if;
  if _product_id is not null and not exists (
    select 1 from public.menu_products p where p.id = _product_id and p.location_id = _location_id
  ) then
    raise exception 'product does not belong to location' using errcode = 'foreign_key_violation';
  end if;
  if _category_id is not null and not exists (
    select 1 from public.menu_categories c where c.id = _category_id and c.location_id = _location_id
  ) then
    raise exception 'category does not belong to location' using errcode = 'foreign_key_violation';
  end if;

  if _id is null then
    insert into public.availability_rules(
      location_id, product_id, category_id, weekday, starts_at, ends_at, valid_from, valid_until, enabled
    ) values(
      _location_id, _product_id, _category_id, _weekday, _starts_at, _ends_at, _valid_from, _valid_until, coalesce(_enabled, true)
    ) returning * into saved;
  else
    update public.availability_rules
    set product_id = _product_id,
        category_id = _category_id,
        weekday = _weekday,
        starts_at = _starts_at,
        ends_at = _ends_at,
        valid_from = _valid_from,
        valid_until = _valid_until,
        enabled = coalesce(_enabled, true)
    where id = _id and location_id = _location_id
    returning * into saved;
  end if;

  if saved.id is null then
    raise exception 'availability rule not found' using errcode = 'no_data_found';
  end if;
  return saved;
end;
$$;

create or replace function public.admin_delete_availability_rule(_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  perform public.require_admin();
  delete from public.availability_rules where id = _id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.get_public_shop_state(_location_id uuid, _at timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  raw_state jsonb;
  accepts boolean;
  override_text text;
  public_status text;
begin
  raw_state := public.server_get_shop_state(_location_id, _at);
  accepts := public.server_shop_accepts_order(_location_id, _at);
  override_text := coalesce(raw_state->>'override', 'auto');

  public_status := case
    when accepts then 'open'
    when override_text = 'pause' then 'pause'
    when override_text = 'today_closed' then 'today_closed'
    else 'closed'
  end;

  return jsonb_build_object(
    'status', public_status,
    'acceptingOrders', accepts,
    'scheduledOpen', coalesce((raw_state->>'scheduledOpen')::boolean, false),
    'operatorMessage', raw_state->>'operatorMessage',
    'minutesUntilScheduledClose', nullif(raw_state->>'minutesUntilScheduledClose', '')::integer,
    'orderCutoffMinutes', nullif(raw_state->>'orderCutoffMinutes', '')::integer,
    'generatedAt', _at
  );
end;
$$;

revoke all on function public.admin_get_ordering_schedule(uuid) from public, anon;
revoke all on function public.admin_replace_weekly_opening_hours(uuid,jsonb) from public, anon;
revoke all on function public.admin_save_special_opening_hour(uuid,uuid,date,time,time,boolean,text) from public, anon;
revoke all on function public.admin_delete_special_opening_hour(uuid) from public, anon;
revoke all on function public.admin_save_ordering_settings(uuid,integer,integer,integer,integer,integer,boolean,boolean,boolean) from public, anon;
revoke all on function public.staff_set_shop_override(uuid,public.shop_override,text) from public, anon;
revoke all on function public.admin_save_availability_rule(uuid,uuid,uuid,uuid,integer,time,time,date,date,boolean) from public, anon;
revoke all on function public.admin_delete_availability_rule(uuid) from public, anon;
revoke all on function public.get_public_shop_state(uuid,timestamptz) from public;

grant execute on function public.admin_get_ordering_schedule(uuid) to authenticated;
grant execute on function public.admin_replace_weekly_opening_hours(uuid,jsonb) to authenticated;
grant execute on function public.admin_save_special_opening_hour(uuid,uuid,date,time,time,boolean,text) to authenticated;
grant execute on function public.admin_delete_special_opening_hour(uuid) to authenticated;
grant execute on function public.admin_save_ordering_settings(uuid,integer,integer,integer,integer,integer,boolean,boolean,boolean) to authenticated;
grant execute on function public.staff_set_shop_override(uuid,public.shop_override,text) to authenticated;
grant execute on function public.admin_save_availability_rule(uuid,uuid,uuid,uuid,integer,time,time,date,date,boolean) to authenticated;
grant execute on function public.admin_delete_availability_rule(uuid) to authenticated;
grant execute on function public.get_public_shop_state(uuid,timestamptz) to anon, authenticated, service_role;

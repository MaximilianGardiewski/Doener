-- D012 function layer. Rush remains orderable under the normal schedule/cutoff
-- and only changes ASAP operational timing. Structural buffer configuration is
-- admin-only; staff may toggle the operational mode through the narrow override RPC.

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
    'rushExtraMinutes', settings.rush_extra_minutes,
    'minutesUntilScheduledClose', minutes_to_close,
    'orderCutoffMinutes', settings.order_cutoff_minutes,
    'operatorMessage', settings.operator_message,
    'onlineOrderingEnabled', settings.online_ordering_enabled,
    'pickupEnabled', settings.pickup_enabled
  );
end;
$$;

create or replace function public.server_shop_accepts_order(_location_id uuid, _at timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  settings public.ordering_settings;
  state jsonb;
  override_text text;
  scheduled_open boolean;
  minutes_to_close integer;
  cutoff_minutes integer;
begin
  select * into settings
  from public.ordering_settings
  where location_id = _location_id;

  if settings.location_id is null
     or not settings.online_ordering_enabled
     or not settings.pickup_enabled then
    return false;
  end if;

  state := public.server_get_shop_state(_location_id, _at);
  override_text := coalesce(state->>'override', 'auto');

  if override_text in ('force_closed', 'pause', 'today_closed') then
    return false;
  end if;
  if override_text = 'force_open' then
    return true;
  end if;

  -- Both auto and rush stay subject to the real opening schedule and cutoff.
  scheduled_open := coalesce((state->>'scheduledOpen')::boolean, false);
  if not scheduled_open then return false; end if;

  minutes_to_close := nullif(state->>'minutesUntilScheduledClose', '')::integer;
  cutoff_minutes := coalesce((state->>'orderCutoffMinutes')::integer, settings.order_cutoff_minutes);
  if minutes_to_close is not null and minutes_to_close <= cutoff_minutes then
    return false;
  end if;

  return true;
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
    when accepts and override_text = 'rush' then 'rush'
    when accepts then 'open'
    when override_text = 'pause' then 'pause'
    when override_text = 'today_closed' then 'today_closed'
    else 'closed'
  end;

  return jsonb_build_object(
    'status', public_status,
    'acceptingOrders', accepts,
    'scheduledOpen', coalesce((raw_state->>'scheduledOpen')::boolean, false),
    'rushExtraMinutes', case when override_text = 'rush' then (raw_state->>'rushExtraMinutes')::integer else 0 end,
    'operatorMessage', raw_state->>'operatorMessage',
    'minutesUntilScheduledClose', nullif(raw_state->>'minutesUntilScheduledClose', '')::integer,
    'orderCutoffMinutes', nullif(raw_state->>'orderCutoffMinutes', '')::integer,
    'generatedAt', _at
  );
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
  if _override not in (
    'auto'::public.shop_override,
    'rush'::public.shop_override,
    'force_closed'::public.shop_override,
    'pause'::public.shop_override,
    'today_closed'::public.shop_override
  ) then
    raise exception 'staff may only use automatic/rush/close/pause/today-closed operational modes'
      using errcode = 'insufficient_privilege';
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

create or replace function public.admin_get_rush_settings(_location_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare settings public.ordering_settings;
begin
  perform public.require_admin();
  select * into settings from public.ordering_settings where location_id = _location_id;
  if settings.location_id is null then
    raise exception 'ordering settings not found' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('rushExtraMinutes', settings.rush_extra_minutes);
end;
$$;

create or replace function public.admin_set_rush_extra_minutes(_location_id uuid, _minutes integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare saved public.ordering_settings;
begin
  perform public.require_admin();
  if _minutes not between 5 and 60 then
    raise exception 'rush extra minutes must be between 5 and 60' using errcode = 'check_violation';
  end if;
  update public.ordering_settings
  set rush_extra_minutes = _minutes
  where location_id = _location_id
  returning * into saved;
  if saved.location_id is null then
    raise exception 'ordering settings not found' using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('rushExtraMinutes', saved.rush_extra_minutes);
end;
$$;

revoke all on function public.server_get_shop_state(uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.server_shop_accepts_order(uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.get_public_shop_state(uuid,timestamptz) from public;
revoke all on function public.staff_set_shop_override(uuid,public.shop_override,text) from public, anon;
revoke all on function public.admin_get_rush_settings(uuid) from public, anon;
revoke all on function public.admin_set_rush_extra_minutes(uuid,integer) from public, anon;

grant execute on function public.server_get_shop_state(uuid,timestamptz) to service_role;
grant execute on function public.server_shop_accepts_order(uuid,timestamptz) to service_role;
grant execute on function public.get_public_shop_state(uuid,timestamptz) to anon, authenticated, service_role;
grant execute on function public.staff_set_shop_override(uuid,public.shop_override,text) to authenticated;
grant execute on function public.admin_get_rush_settings(uuid) to authenticated;
grant execute on function public.admin_set_rush_extra_minutes(uuid,integer) to authenticated;

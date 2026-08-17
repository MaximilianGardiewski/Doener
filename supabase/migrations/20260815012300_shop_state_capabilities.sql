-- Expose the non-sensitive ordering capability flags in the server-side shop-state
-- snapshot. The local public prototype consumes this through its loopback runtime;
-- PostgreSQL remains the final order-acceptance authority.

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
    'operatorMessage', settings.operator_message,
    'onlineOrderingEnabled', settings.online_ordering_enabled,
    'pickupEnabled', settings.pickup_enabled
  );
end;
$$;

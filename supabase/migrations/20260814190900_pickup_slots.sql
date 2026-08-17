-- Capacity-aware public pickup-slot discovery.
-- The final race-safe gate remains the BEFORE INSERT trigger from migration 908.

create or replace function public.get_available_pickup_slots(
  _location_id uuid,
  _from timestamptz default now(),
  _days integer default 7
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  settings public.ordering_settings;
  loc public.locations;
  bounded_days integer;
  slot_seconds integer;
  first_slot timestamptz;
  horizon timestamptz;
  result jsonb;
begin
  select * into settings
  from public.ordering_settings
  where location_id = _location_id;

  select * into loc
  from public.locations
  where id = _location_id and active;

  if settings.location_id is null or loc.id is null then
    return jsonb_build_object('locationId', _location_id, 'slotMinutes', null, 'slots', '[]'::jsonb);
  end if;

  bounded_days := greatest(1, least(coalesce(_days, 7), 14));
  slot_seconds := settings.slot_minutes * 60;
  if slot_seconds <= 0 then
    raise exception 'invalid slot duration' using errcode = 'check_violation';
  end if;

  -- Always offer the next full configured slot, never a slot that already began.
  first_slot := to_timestamp(
    ceil(extract(epoch from greatest(_from, now())) / slot_seconds) * slot_seconds
  );
  if first_slot <= greatest(_from, now()) then
    first_slot := first_slot + make_interval(mins => settings.slot_minutes);
  end if;

  horizon := first_slot + make_interval(days => bounded_days);

  select coalesce(jsonb_agg(slot_json order by starts_at), '[]'::jsonb)
  into result
  from (
    select
      candidate.starts_at,
      jsonb_build_object(
        'startsAt', candidate.starts_at,
        'localDate', to_char(candidate.starts_at at time zone loc.timezone, 'YYYY-MM-DD'),
        'localTime', to_char(candidate.starts_at at time zone loc.timezone, 'HH24:MI'),
        'capacity', settings.slot_capacity,
        'occupied', capacity_state.occupied,
        'remaining', greatest(settings.slot_capacity - capacity_state.occupied, 0)
      ) as slot_json
    from generate_series(
      first_slot,
      horizon,
      make_interval(mins => settings.slot_minutes)
    ) as candidate(starts_at)
    cross join lateral (
      select count(*)::integer as occupied
      from public.orders o
      where o.location_id = _location_id
        and o.state not in ('completed','rejected','cancelled')
        and (
          (
            o.state = 'waiting_for_acceptance'
            and o.requested_pickup_at >= candidate.starts_at
            and o.requested_pickup_at < candidate.starts_at + make_interval(mins => settings.slot_minutes)
          )
          or
          (
            o.state <> 'waiting_for_acceptance'
            and o.accepted_pickup_at >= candidate.starts_at
            and o.accepted_pickup_at < candidate.starts_at + make_interval(mins => settings.slot_minutes)
          )
        )
    ) capacity_state
    where public.server_shop_accepts_order(_location_id, candidate.starts_at)
      and capacity_state.occupied < settings.slot_capacity
  ) available;

  return jsonb_build_object(
    'locationId', _location_id,
    'timezone', loc.timezone,
    'slotMinutes', settings.slot_minutes,
    'generatedAt', now(),
    'slots', result
  );
end;
$$;

revoke all on function public.get_available_pickup_slots(uuid,timestamptz,integer) from public;
grant execute on function public.get_available_pickup_slots(uuid,timestamptz,integer)
  to anon, authenticated, service_role;

-- Final database gate for customer web orders.
-- Application checks provide UX; this trigger is the race-safe integrity boundary.

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

create or replace function public.protect_web_order_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.ordering_settings;
  gate_at timestamptz;
  slot_start timestamptz;
  slot_end timestamptz;
  slot_seconds integer;
  occupied integer;
begin
  if new.source <> 'web'::public.order_source
     or new.state <> 'waiting_for_acceptance'::public.order_state then
    return new;
  end if;

  gate_at := coalesce(new.requested_pickup_at, now());

  if new.requested_pickup_at is not null and new.requested_pickup_at <= now() then
    raise exception 'requested pickup time must be in the future' using errcode = 'check_violation';
  end if;

  if not public.server_shop_accepts_order(new.location_id, gate_at) then
    raise exception 'shop is not accepting online pickup orders at requested time'
      using errcode = 'check_violation';
  end if;

  if new.requested_pickup_at is null then
    return new;
  end if;

  select * into settings
  from public.ordering_settings
  where location_id = new.location_id;

  if settings.location_id is null then
    raise exception 'ordering settings not found' using errcode = 'no_data_found';
  end if;

  slot_seconds := settings.slot_minutes * 60;
  if slot_seconds <= 0 then
    raise exception 'invalid slot duration' using errcode = 'check_violation';
  end if;

  if mod(floor(extract(epoch from new.requested_pickup_at))::bigint, slot_seconds::bigint) <> 0 then
    raise exception 'requested pickup time is not aligned to configured slot duration'
      using errcode = 'check_violation';
  end if;

  slot_start := new.requested_pickup_at;
  slot_end := slot_start + make_interval(mins => settings.slot_minutes);

  -- Serialize all inserts for exactly the same location+slot with one bigint
  -- advisory key. hashtextextended returns bigint, avoiding the narrower int4
  -- key/casting path while remaining deterministic within PostgreSQL.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'business_web_factory:pickup_slot:' || new.location_id::text || ':' || slot_start::text,
      0
    )
  );

  select count(*)::integer into occupied
  from public.orders o
  where o.location_id = new.location_id
    and o.state not in ('completed','rejected','cancelled')
    and (
      (
        o.state = 'waiting_for_acceptance'
        and o.requested_pickup_at >= slot_start
        and o.requested_pickup_at < slot_end
      )
      or
      (
        o.state <> 'waiting_for_acceptance'
        and o.accepted_pickup_at >= slot_start
        and o.accepted_pickup_at < slot_end
      )
    );

  if occupied >= settings.slot_capacity then
    raise exception 'pickup slot capacity exhausted' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.server_shop_accepts_order(uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.protect_web_order_gate() from public, anon, authenticated;
grant execute on function public.server_shop_accepts_order(uuid,timestamptz) to service_role;

drop trigger if exists t_orders_protect_web_gate on public.orders;
create trigger t_orders_protect_web_gate
before insert on public.orders
for each row execute function public.protect_web_order_gate();

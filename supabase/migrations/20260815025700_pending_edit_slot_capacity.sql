-- D043 application-level slot revalidation can exclude the pending order being edited.
-- The transaction-level server_validate_web_order_gate remains the final race-safe gate.

drop function if exists public.server_get_slot_capacity(uuid,timestamptz);

create function public.server_get_slot_capacity(
  _location_id uuid,
  _pickup_at timestamptz,
  _exclude_order_id uuid default null
)
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
  select * into settings
  from public.ordering_settings
  where location_id = _location_id;

  if settings.location_id is null then
    raise exception 'ordering settings not found' using errcode = 'no_data_found';
  end if;

  slot_end := _pickup_at + make_interval(mins => settings.slot_minutes);

  select count(*)::integer into occupied
  from public.orders o
  where o.location_id = _location_id
    and (_exclude_order_id is null or o.id <> _exclude_order_id)
    and o.state not in ('completed','rejected','cancelled')
    and (
      (o.state = 'waiting_for_acceptance'
        and o.requested_pickup_at >= _pickup_at
        and o.requested_pickup_at < slot_end)
      or
      (o.state <> 'waiting_for_acceptance'
        and o.accepted_pickup_at >= _pickup_at
        and o.accepted_pickup_at < slot_end)
    );

  return jsonb_build_object(
    'capacity', settings.slot_capacity,
    'acceptedOrderCount', occupied
  );
end;
$$;

revoke all on function public.server_get_slot_capacity(uuid,timestamptz,uuid)
  from public, anon, authenticated;
grant execute on function public.server_get_slot_capacity(uuid,timestamptz,uuid)
  to service_role;

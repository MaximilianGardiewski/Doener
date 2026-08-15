-- D012: the database remains authoritative for Rush timing. The Node/KDS layer
-- may only submit its existing 15/20/30 base ETA. For ASAP orders, the current
-- configured Rush buffer is added inside the staff transition itself. Preorders
-- are never shifted by Rush and continue to use staff_accept_requested_slot().
-- Preserve the existing D055/D009 invariant: this RPC is ASAP-only.

create or replace function public.staff_accept_order(
  _order_id uuid,
  _accepted_pickup_at timestamptz
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders;
  settings public.ordering_settings;
  updated public.orders;
  effective_pickup_at timestamptz;
  applied_rush_minutes integer := 0;
begin
  perform public.require_staff();

  if _accepted_pickup_at is null or _accepted_pickup_at <= now() then
    raise exception 'future accepted pickup time required' using errcode = 'check_violation';
  end if;

  select * into current_order
  from public.orders
  where id = _order_id
  for update;

  if current_order.id is null
     or current_order.state <> 'waiting_for_acceptance'::public.order_state
     or current_order.requested_pickup_at is not null then
    raise exception 'ASAP order cannot be accepted from current state'
      using errcode = 'check_violation';
  end if;

  select * into settings
  from public.ordering_settings
  where location_id = current_order.location_id;

  if settings.location_id is null then
    raise exception 'ordering settings not found' using errcode = 'no_data_found';
  end if;

  effective_pickup_at := _accepted_pickup_at;
  if settings.override = 'rush'::public.shop_override then
    applied_rush_minutes := settings.rush_extra_minutes;
    effective_pickup_at := _accepted_pickup_at + make_interval(mins => applied_rush_minutes);
  end if;

  update public.orders
  set state = 'preparing'::public.order_state,
      accepted_pickup_at = effective_pickup_at,
      accepted_at = now()
  where id = current_order.id
    and state = 'waiting_for_acceptance'
    and requested_pickup_at is null
  returning * into updated;

  if updated.id is null then
    raise exception 'ASAP order cannot be accepted from current state'
      using errcode = 'check_violation';
  end if;

  insert into public.order_events(order_id, event_type, actor_user_id, metadata)
  values(
    updated.id,
    'order_accepted',
    auth.uid(),
    jsonb_build_object(
      'acceptedPickupAt', updated.accepted_pickup_at,
      'mode', 'asap',
      'rushExtraMinutes', applied_rush_minutes
    )
  );
  return updated;
end;
$$;

revoke all on function public.staff_accept_order(uuid,timestamptz) from public, anon;
grant execute on function public.staff_accept_order(uuid,timestamptz) to authenticated;

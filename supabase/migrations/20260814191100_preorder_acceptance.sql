-- Separate ASAP promises from scheduled preorder confirmation.
-- A preorder keeps its customer-selected slot as the authoritative accepted time.

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
  updated public.orders;
begin
  perform public.require_staff();

  if _accepted_pickup_at is null or _accepted_pickup_at <= now() then
    raise exception 'future accepted pickup time required' using errcode = 'check_violation';
  end if;

  update public.orders
  set
    state = 'preparing',
    accepted_pickup_at = _accepted_pickup_at,
    accepted_at = now()
  where id = _order_id
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
    jsonb_build_object('acceptedPickupAt', updated.accepted_pickup_at, 'mode', 'asap')
  );

  return updated;
end;
$$;

create or replace function public.staff_accept_requested_slot(_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.orders;
begin
  perform public.require_staff();

  update public.orders
  set
    state = 'scheduled',
    accepted_pickup_at = requested_pickup_at,
    accepted_at = now()
  where id = _order_id
    and state = 'waiting_for_acceptance'
    and requested_pickup_at is not null
    and requested_pickup_at > now()
  returning * into updated;

  if updated.id is null then
    raise exception 'preorder slot cannot be confirmed from current state'
      using errcode = 'check_violation';
  end if;

  insert into public.order_events(order_id, event_type, actor_user_id, metadata)
  values(
    updated.id,
    'order_accepted',
    auth.uid(),
    jsonb_build_object('acceptedPickupAt', updated.accepted_pickup_at, 'mode', 'requested_slot')
  );

  return updated;
end;
$$;

revoke all on function public.staff_accept_order(uuid,timestamptz) from public, anon;
revoke all on function public.staff_accept_requested_slot(uuid) from public, anon;
grant execute on function public.staff_accept_order(uuid,timestamptz) to authenticated;
grant execute on function public.staff_accept_requested_slot(uuid) to authenticated;

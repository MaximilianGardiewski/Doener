-- Harden operational order mutations: staff uses narrow state-transition RPCs.
-- Direct broad UPDATE access added during the initial scaffold is removed here.

-- Ordering settings: staff may read operational state; only admin may structurally edit settings.
drop policy if exists "staff manage ordering settings" on public.ordering_settings;
create policy "staff read ordering settings" on public.ordering_settings
for select to authenticated using (public.is_staff());
create policy "admins manage ordering settings" on public.ordering_settings
for all to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- Orders: staff reads rows, but transitions happen only through RPCs below.
drop policy if exists "staff update orders" on public.orders;
revoke update on public.orders from authenticated;

create or replace function public.require_staff()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'staff role required' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

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
  if _accepted_pickup_at is null then
    raise exception 'accepted pickup time required' using errcode = 'check_violation';
  end if;

  update public.orders
  set state = case when requested_pickup_at is null then 'preparing'::public.order_state else 'scheduled'::public.order_state end,
      accepted_pickup_at = _accepted_pickup_at,
      accepted_at = now()
  where id = _order_id
    and state = 'waiting_for_acceptance'
  returning * into updated;

  if updated.id is null then
    raise exception 'order cannot be accepted from current state' using errcode = 'check_violation';
  end if;

  insert into public.order_events(order_id, event_type, actor_user_id, metadata)
  values(updated.id, 'order_accepted', auth.uid(), jsonb_build_object('acceptedPickupAt', updated.accepted_pickup_at));
  return updated;
end;
$$;

create or replace function public.staff_activate_scheduled_order(_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare updated public.orders;
begin
  perform public.require_staff();
  update public.orders set state = 'preparing'
  where id = _order_id and state = 'scheduled'
  returning * into updated;
  if updated.id is null then
    raise exception 'scheduled order cannot be activated' using errcode = 'check_violation';
  end if;
  insert into public.order_events(order_id,event_type,actor_user_id)
  values(updated.id,'scheduled_order_activated',auth.uid());
  return updated;
end;
$$;

create or replace function public.staff_mark_order_ready(_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare updated public.orders;
begin
  perform public.require_staff();
  update public.orders set state = 'ready', ready_at = now()
  where id = _order_id and state = 'preparing'
  returning * into updated;
  if updated.id is null then
    raise exception 'only preparing orders can become ready' using errcode = 'check_violation';
  end if;
  insert into public.order_events(order_id,event_type,actor_user_id)
  values(updated.id,'order_ready',auth.uid());
  return updated;
end;
$$;

create or replace function public.staff_complete_order(_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare updated public.orders;
begin
  perform public.require_staff();
  update public.orders set state = 'completed', completed_at = now()
  where id = _order_id and state = 'ready'
  returning * into updated;
  if updated.id is null then
    raise exception 'only ready orders can be completed' using errcode = 'check_violation';
  end if;
  insert into public.order_events(order_id,event_type,actor_user_id)
  values(updated.id,'order_completed',auth.uid());
  return updated;
end;
$$;

create or replace function public.staff_reject_order(_order_id uuid, _reason text)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare updated public.orders;
begin
  perform public.require_staff();
  if coalesce(trim(_reason),'') = '' then
    raise exception 'rejection reason required' using errcode = 'check_violation';
  end if;
  update public.orders
  set state = 'rejected', rejected_at = now(), rejection_reason = trim(_reason)
  where id = _order_id and state = 'waiting_for_acceptance'
  returning * into updated;
  if updated.id is null then
    raise exception 'only pending orders can be rejected' using errcode = 'check_violation';
  end if;
  insert into public.order_events(order_id,event_type,actor_user_id,metadata)
  values(updated.id,'order_rejected',auth.uid(),jsonb_build_object('reason',updated.rejection_reason));
  return updated;
end;
$$;

create or replace function public.staff_delay_order(_order_id uuid, _minutes integer)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare updated public.orders;
begin
  perform public.require_staff();
  if _minutes < 1 or _minutes > 180 then
    raise exception 'delay must be between 1 and 180 minutes' using errcode = 'check_violation';
  end if;
  update public.orders
  set accepted_pickup_at = accepted_pickup_at + make_interval(mins => _minutes)
  where id = _order_id
    and state in ('scheduled','preparing')
    and accepted_pickup_at is not null
  returning * into updated;
  if updated.id is null then
    raise exception 'order cannot be delayed from current state' using errcode = 'check_violation';
  end if;
  insert into public.order_events(order_id,event_type,actor_user_id,metadata)
  values(updated.id,'pickup_eta_delayed',auth.uid(),jsonb_build_object('minutes',_minutes,'acceptedPickupAt',updated.accepted_pickup_at));
  return updated;
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
declare updated public.ordering_settings;
begin
  perform public.require_staff();
  update public.ordering_settings
  set override = _override,
      operator_message = nullif(trim(_operator_message),'')
  where location_id = _location_id
  returning * into updated;
  if updated.location_id is null then
    raise exception 'ordering settings not found' using errcode = 'no_data_found';
  end if;
  return updated;
end;
$$;

revoke all on function public.require_staff() from public, anon;
revoke all on function public.staff_accept_order(uuid,timestamptz) from public, anon;
revoke all on function public.staff_activate_scheduled_order(uuid) from public, anon;
revoke all on function public.staff_mark_order_ready(uuid) from public, anon;
revoke all on function public.staff_complete_order(uuid) from public, anon;
revoke all on function public.staff_reject_order(uuid,text) from public, anon;
revoke all on function public.staff_delay_order(uuid,integer) from public, anon;
revoke all on function public.staff_set_shop_override(uuid,public.shop_override,text) from public, anon;

grant execute on function public.require_staff() to authenticated;
grant execute on function public.staff_accept_order(uuid,timestamptz) to authenticated;
grant execute on function public.staff_activate_scheduled_order(uuid) to authenticated;
grant execute on function public.staff_mark_order_ready(uuid) to authenticated;
grant execute on function public.staff_complete_order(uuid) to authenticated;
grant execute on function public.staff_reject_order(uuid,text) to authenticated;
grant execute on function public.staff_delay_order(uuid,integer) to authenticated;
grant execute on function public.staff_set_shop_override(uuid,public.shop_override,text) to authenticated;

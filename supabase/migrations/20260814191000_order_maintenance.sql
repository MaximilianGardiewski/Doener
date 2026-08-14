-- Idempotent application-worker maintenance for V1 ordering.
-- Called periodically by the self-hosted app/local dev server. No paid scheduler required.

create or replace function public.server_process_order_maintenance(_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  warning_order public.orders;
  timeout_order public.orders;
  scheduled_order public.orders;
  settings public.ordering_settings;
  warning_items jsonb := '[]'::jsonb;
  rejected_items jsonb := '[]'::jsonb;
  activated_items jsonb := '[]'::jsonb;
begin
  -- One-minute warning before the configured acceptance timeout. The event is
  -- emitted once and can drive a stronger KDS visual/audio escalation.
  for warning_order in
    select o.*
    from public.orders o
    join public.ordering_settings s on s.location_id = o.location_id
    where o.state = 'waiting_for_acceptance'
      and o.submitted_at is not null
      and o.submitted_at <= _now - make_interval(mins => greatest(s.acceptance_timeout_minutes - 1, 0))
      and o.submitted_at > _now - make_interval(mins => s.acceptance_timeout_minutes)
      and not exists (
        select 1 from public.order_events e
        where e.order_id = o.id and e.event_type = 'acceptance_timeout_warning'
      )
    order by o.submitted_at
    for update of o skip locked
  loop
    insert into public.order_events(order_id, event_type, metadata)
    values (
      warning_order.id,
      'acceptance_timeout_warning',
      jsonb_build_object('at', _now)
    );

    warning_items := warning_items || jsonb_build_array(jsonb_build_object(
      'orderId', warning_order.id,
      'orderNumber', warning_order.order_number,
      'kind', 'acceptance_warning'
    ));
  end loop;

  -- Untouched orders become rejected after the location-specific timeout.
  for timeout_order in
    select o.*
    from public.orders o
    join public.ordering_settings s on s.location_id = o.location_id
    where o.state = 'waiting_for_acceptance'
      and o.submitted_at is not null
      and o.submitted_at <= _now - make_interval(mins => s.acceptance_timeout_minutes)
    order by o.submitted_at
    for update of o skip locked
  loop
    update public.orders
    set
      state = 'rejected',
      rejected_at = _now,
      rejection_reason = 'Nicht rechtzeitig bestätigt'
    where id = timeout_order.id
      and state = 'waiting_for_acceptance';

    if found then
      insert into public.order_events(order_id, event_type, metadata)
      values (
        timeout_order.id,
        'order_auto_rejected_timeout',
        jsonb_build_object('at', _now)
      );

      rejected_items := rejected_items || jsonb_build_array(jsonb_build_object(
        'orderId', timeout_order.id,
        'orderNumber', timeout_order.order_number,
        'publicToken', timeout_order.public_token,
        'mobile', timeout_order.mobile,
        'kind', 'rejected'
      ));
    end if;
  end loop;

  -- Confirmed future orders enter preparation automatically at the configured
  -- lead time. `accepted_pickup_at` is the authoritative confirmed ETA.
  for scheduled_order in
    select o.*
    from public.orders o
    join public.ordering_settings s on s.location_id = o.location_id
    where o.state = 'scheduled'
      and o.accepted_pickup_at is not null
      and o.accepted_pickup_at <= _now + make_interval(mins => s.preparation_lead_minutes)
    order by o.accepted_pickup_at
    for update of o skip locked
  loop
    update public.orders
    set state = 'preparing'
    where id = scheduled_order.id
      and state = 'scheduled';

    if found then
      insert into public.order_events(order_id, event_type, metadata)
      values (
        scheduled_order.id,
        'scheduled_order_activated',
        jsonb_build_object('at', _now, 'acceptedPickupAt', scheduled_order.accepted_pickup_at)
      );

      activated_items := activated_items || jsonb_build_array(jsonb_build_object(
        'orderId', scheduled_order.id,
        'orderNumber', scheduled_order.order_number,
        'kind', 'activated'
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'processedAt', _now,
    'warnings', warning_items,
    'rejected', rejected_items,
    'activated', activated_items
  );
end;
$$;

revoke all on function public.server_process_order_maintenance(timestamptz)
  from public, anon, authenticated;
grant execute on function public.server_process_order_maintenance(timestamptz)
  to service_role;

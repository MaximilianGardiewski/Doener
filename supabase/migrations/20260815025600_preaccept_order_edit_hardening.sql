-- D043 follow-up hardening: remove variable/column ambiguity, make ASAP edits
-- validate against current availability, and ensure the received outbox freezes
-- the authoritative server-computed total before the transaction commits.

create or replace function public.protect_web_order_item_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_order public.orders;
  availability_at timestamptz;
begin
  if new.product_id is null then
    return new;
  end if;

  select * into parent_order
  from public.orders
  where id = new.order_id;

  if parent_order.id is null or parent_order.source <> 'web'::public.order_source then
    return new;
  end if;

  if not exists (
    select 1
    from public.menu_products p
    where p.id = new.product_id
      and p.location_id = parent_order.location_id
  ) then
    raise exception 'product does not belong to order location'
      using errcode = 'foreign_key_violation';
  end if;

  -- Pending ASAP orders are revalidated at the actual mutation time. Future
  -- preorders remain evaluated at their requested pickup time.
  availability_at := coalesce(
    parent_order.requested_pickup_at,
    case
      when parent_order.state = 'waiting_for_acceptance'::public.order_state then now()
      else parent_order.submitted_at
    end,
    now()
  );

  if not public.server_is_product_available(new.product_id, availability_at) then
    raise exception 'product unavailable for order pickup time'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_web_order_item_availability() from public, anon, authenticated;

create or replace function public.server_create_verified_order(_payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  created_order public.orders;
  computed_total integer;
  availability_at timestamptz;
begin
  if coalesce(trim(_payload->>'customerFirstName'), '') = '' then
    raise exception 'customer first name required' using errcode = 'check_violation';
  end if;
  if coalesce(trim(_payload->>'mobile'), '') = '' then
    raise exception 'mobile required' using errcode = 'check_violation';
  end if;

  availability_at := coalesce(nullif(_payload->>'requestedPickupAt', '')::timestamptz, now());

  insert into public.orders (
    location_id,
    source,
    fulfillment,
    state,
    customer_first_name,
    mobile,
    comment,
    requested_pickup_at,
    total_cents,
    submitted_at
  ) values (
    (_payload->>'locationId')::uuid,
    'web'::public.order_source,
    'pickup'::public.fulfillment_type,
    'waiting_for_acceptance'::public.order_state,
    trim(_payload->>'customerFirstName'),
    trim(_payload->>'mobile'),
    nullif(trim(_payload->>'comment'), ''),
    nullif(_payload->>'requestedPickupAt', '')::timestamptz,
    0,
    now()
  ) returning * into created_order;

  computed_total := public.server_write_verified_order_items(
    created_order.id,
    _payload->'items',
    availability_at
  );

  update public.orders
  set total_cents = computed_total
  where id = created_order.id
  returning * into created_order;

  -- The received outbox row is created by the AFTER INSERT trigger while the
  -- total is still the safe placeholder 0. Correct its immutable payload in
  -- this same transaction, before any worker can observe the committed row.
  update public.order_notification_outbox
  set payload = jsonb_set(payload, '{totalCents}', to_jsonb(computed_total), true),
      updated_at = now()
  where order_id = created_order.id
    and kind = 'received'
    and dedupe_key = created_order.id::text || ':received';

  insert into public.order_events(order_id, event_type, metadata)
  values(created_order.id, 'order_received', jsonb_build_object('source','web'));

  return created_order;
end;
$$;

create or replace function public.server_replace_pending_order(_public_token uuid, _payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  new_requested_pickup_at timestamptz;
  availability_at timestamptz;
  computed_total integer;
  previous_pickup_at timestamptz;
begin
  select * into order_row
  from public.orders
  where public_token = _public_token
  for update;

  if order_row.id is null
     or order_row.state <> 'waiting_for_acceptance'::public.order_state
     or order_row.source <> 'web'::public.order_source
     or order_row.fulfillment <> 'pickup'::public.fulfillment_type then
    raise exception 'order is not editable' using errcode = 'check_violation';
  end if;

  new_requested_pickup_at := nullif(_payload->>'requestedPickupAt', '')::timestamptz;
  previous_pickup_at := order_row.requested_pickup_at;
  availability_at := coalesce(new_requested_pickup_at, now());

  perform public.server_validate_web_order_gate(
    order_row.location_id,
    new_requested_pickup_at,
    order_row.id
  );

  update public.orders o
  set comment = nullif(trim(_payload->>'comment'), ''),
      requested_pickup_at = new_requested_pickup_at,
      total_cents = 0
  where o.id = order_row.id;

  computed_total := public.server_write_verified_order_items(
    order_row.id,
    _payload->'items',
    availability_at
  );

  update public.orders o
  set total_cents = computed_total
  where o.id = order_row.id;

  insert into public.order_events(order_id, event_type, metadata)
  values(
    order_row.id,
    'customer_edited',
    jsonb_build_object(
      'source', 'public_token',
      'previousRequestedPickupAt', previous_pickup_at,
      'requestedPickupAt', new_requested_pickup_at,
      'totalCents', computed_total
    )
  );

  return public.get_public_order_status(_public_token);
end;
$$;

revoke all on function public.server_create_verified_order(jsonb) from public, anon, authenticated;
revoke all on function public.server_replace_pending_order(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.server_create_verified_order(jsonb) to service_role;
grant execute on function public.server_replace_pending_order(uuid,jsonb) to service_role;

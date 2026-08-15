-- D043: token-scoped customer edits are allowed only while an order is still
-- waiting for staff acceptance. The edit path reuses the same authoritative
-- shop/slot gate and the same item/modifier/price writer as initial persistence.

alter table public.order_item_options
  add column if not exists modifier_group_id uuid references public.modifier_groups(id) on delete set null,
  add column if not exists modifier_option_id uuid references public.modifier_options(id) on delete set null;

comment on column public.order_item_options.modifier_group_id is
  'Stable modifier-group identity retained for safe pre-accept reconstruction; snapshot names remain the display history.';
comment on column public.order_item_options.modifier_option_id is
  'Stable modifier-option identity retained for safe pre-accept reconstruction; snapshot names/prices remain the display history.';

create or replace function public.server_validate_web_order_gate(
  _location_id uuid,
  _requested_pickup_at timestamptz,
  _exclude_order_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.ordering_settings;
  slot_start timestamptz;
  slot_end timestamptz;
  slot_seconds integer;
  occupied integer;
begin
  -- D037: even a future preorder cannot be newly submitted/edited while the
  -- shop is currently closed or manually paused.
  if not public.server_shop_accepts_order(_location_id, now()) then
    raise exception 'shop is not currently accepting online pickup orders'
      using errcode = 'check_violation';
  end if;

  if _requested_pickup_at is null then
    return;
  end if;

  if _requested_pickup_at <= now() then
    raise exception 'requested pickup time must be in the future'
      using errcode = 'check_violation';
  end if;

  if not public.server_shop_accepts_order(_location_id, _requested_pickup_at) then
    raise exception 'shop is not accepting online pickup orders at requested time'
      using errcode = 'check_violation';
  end if;

  select * into settings
  from public.ordering_settings
  where location_id = _location_id;

  if settings.location_id is null then
    raise exception 'ordering settings not found' using errcode = 'no_data_found';
  end if;

  slot_seconds := settings.slot_minutes * 60;
  if slot_seconds <= 0 then
    raise exception 'invalid slot duration' using errcode = 'check_violation';
  end if;

  if mod(floor(extract(epoch from _requested_pickup_at))::bigint, slot_seconds::bigint) <> 0 then
    raise exception 'requested pickup time is not aligned to configured slot duration'
      using errcode = 'check_violation';
  end if;

  slot_start := _requested_pickup_at;
  slot_end := slot_start + make_interval(mins => settings.slot_minutes);

  perform pg_advisory_xact_lock(
    hashtextextended(
      'business_web_factory:pickup_slot:' || _location_id::text || ':' || slot_start::text,
      0
    )
  );

  select count(*)::integer into occupied
  from public.orders o
  where o.location_id = _location_id
    and (_exclude_order_id is null or o.id <> _exclude_order_id)
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
end;
$$;

create or replace function public.protect_web_order_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source = 'web'::public.order_source
     and new.state = 'waiting_for_acceptance'::public.order_state then
    perform public.server_validate_web_order_gate(new.location_id, new.requested_pickup_at, null);
  end if;
  return new;
end;
$$;

create or replace function public.server_write_verified_order_items(
  _order_id uuid,
  _items jsonb,
  _availability_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_order public.orders;
  item jsonb;
  selection jsonb;
  option_id_text text;
  created_item_id uuid;
  product_row public.menu_products;
  group_row public.modifier_groups;
  option_row public.modifier_options;
  computed_total integer := 0;
  item_quantity integer;
  item_unit_price integer;
  item_line_total integer;
  selection_count integer;
  distinct_selection_count integer;
  option_count integer;
  distinct_option_count integer;
  item_sort integer := 0;
begin
  select * into parent_order
  from public.orders
  where id = _order_id
  for update;

  if parent_order.id is null then
    raise exception 'order not found' using errcode = 'no_data_found';
  end if;

  if jsonb_typeof(_items) <> 'array' or coalesce(jsonb_array_length(_items), 0) < 1 then
    raise exception 'order must contain at least one item' using errcode = 'check_violation';
  end if;

  delete from public.order_items where order_id = _order_id;

  for item in select value from jsonb_array_elements(_items) loop
    item_quantity := coalesce((item->>'quantity')::integer, 0);
    if item_quantity < 1 or item_quantity > 99 then
      raise exception 'invalid item quantity' using errcode = 'check_violation';
    end if;

    select * into product_row
    from public.menu_products
    where id = (item->>'productId')::uuid
      and location_id = parent_order.location_id
      and status = 'published'
      and orderable_online;

    if product_row.id is null then
      raise exception 'product not orderable for location' using errcode = 'foreign_key_violation';
    end if;

    if exists (
      select 1 from public.snoozes s
      where s.product_id = product_row.id and s.until_at > _availability_at
    ) then
      raise exception 'product is snoozed for pickup time' using errcode = 'check_violation';
    end if;

    if jsonb_typeof(coalesce(item->'selections', '[]'::jsonb)) <> 'array' then
      raise exception 'selections must be an array' using errcode = 'check_violation';
    end if;

    select jsonb_array_length(coalesce(item->'selections', '[]'::jsonb)) into selection_count;
    select count(distinct value->>'groupId')::integer
      into distinct_selection_count
      from jsonb_array_elements(coalesce(item->'selections', '[]'::jsonb));
    if selection_count <> distinct_selection_count then
      raise exception 'duplicate modifier groups are not allowed' using errcode = 'check_violation';
    end if;

    if exists (
      select 1
      from public.product_modifier_groups pmg
      join public.modifier_groups g on g.id = pmg.group_id
      where pmg.product_id = product_row.id
        and g.min_selections > 0
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(item->'selections', '[]'::jsonb)) s
          where (s.value->>'groupId')::uuid = g.id
        )
    ) then
      raise exception 'required modifier group missing' using errcode = 'check_violation';
    end if;

    item_unit_price := product_row.base_price_cents;

    -- First pass validates every group/option and computes the authoritative price.
    for selection in select value from jsonb_array_elements(coalesce(item->'selections', '[]'::jsonb)) loop
      select * into group_row
      from public.modifier_groups g
      where g.id = (selection->>'groupId')::uuid
        and exists (
          select 1 from public.product_modifier_groups pmg
          where pmg.product_id = product_row.id and pmg.group_id = g.id
        );

      if group_row.id is null then
        raise exception 'modifier group not linked to product' using errcode = 'check_violation';
      end if;

      if jsonb_typeof(coalesce(selection->'optionIds', '[]'::jsonb)) <> 'array' then
        raise exception 'modifier option ids must be an array' using errcode = 'check_violation';
      end if;

      option_count := jsonb_array_length(coalesce(selection->'optionIds', '[]'::jsonb));
      select count(distinct value)::integer into distinct_option_count
      from jsonb_array_elements_text(coalesce(selection->'optionIds', '[]'::jsonb));

      if option_count <> distinct_option_count then
        raise exception 'duplicate modifier options are not allowed' using errcode = 'check_violation';
      end if;
      if option_count < group_row.min_selections or option_count > group_row.max_selections then
        raise exception 'modifier selection count out of bounds' using errcode = 'check_violation';
      end if;

      for option_id_text in select jsonb_array_elements_text(coalesce(selection->'optionIds','[]'::jsonb)) loop
        select * into option_row
        from public.modifier_options
        where id = option_id_text::uuid
          and group_id = group_row.id
          and active;

        if option_row.id is null then
          raise exception 'modifier option not found in group' using errcode = 'check_violation';
        end if;

        if exists (
          select 1 from public.snoozes s
          where s.modifier_option_id = option_row.id and s.until_at > _availability_at
        ) then
          raise exception 'modifier option is snoozed for pickup time' using errcode = 'check_violation';
        end if;

        item_unit_price := item_unit_price + option_row.price_delta_cents;
      end loop;
    end loop;

    item_line_total := item_unit_price * item_quantity;
    computed_total := computed_total + item_line_total;

    insert into public.order_items (
      order_id,
      product_id,
      product_name_snapshot,
      base_price_cents_snapshot,
      unit_price_cents_snapshot,
      line_total_cents,
      quantity,
      comment,
      sort
    ) values (
      _order_id,
      product_row.id,
      product_row.name,
      product_row.base_price_cents,
      item_unit_price,
      item_line_total,
      item_quantity,
      nullif(trim(item->>'comment'), ''),
      item_sort
    ) returning id into created_item_id;

    -- Second pass stores display snapshots plus stable IDs for later safe editing.
    for selection in select value from jsonb_array_elements(coalesce(item->'selections', '[]'::jsonb)) loop
      select * into group_row
      from public.modifier_groups
      where id = (selection->>'groupId')::uuid;

      for option_id_text in select jsonb_array_elements_text(coalesce(selection->'optionIds','[]'::jsonb)) loop
        select * into option_row
        from public.modifier_options
        where id = option_id_text::uuid and group_id = group_row.id;

        insert into public.order_item_options (
          order_item_id,
          modifier_group_id,
          modifier_option_id,
          group_name_snapshot,
          option_name_snapshot,
          price_delta_cents_snapshot
        ) values (
          created_item_id,
          group_row.id,
          option_row.id,
          group_row.name,
          option_row.name,
          option_row.price_delta_cents
        );
      end loop;
    end loop;

    item_sort := item_sort + 1;
  end loop;

  return computed_total;
end;
$$;

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

  insert into public.order_events(order_id, event_type, metadata)
  values(created_order.id, 'order_received', jsonb_build_object('source','web'));

  return created_order;
end;
$$;

create or replace function public.server_get_pending_order_edit_context(_public_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  order_row public.orders;
  result jsonb;
begin
  select * into order_row
  from public.orders
  where public_token = _public_token;

  if order_row.id is null or order_row.state <> 'waiting_for_acceptance'::public.order_state then
    raise exception 'order is not editable' using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from public.order_items i
    where i.order_id = order_row.id and i.product_id is null
  ) or exists (
    select 1
    from public.order_item_options io
    join public.order_items i on i.id = io.order_item_id
    where i.order_id = order_row.id
      and (io.modifier_group_id is null or io.modifier_option_id is null)
  ) then
    raise exception 'order cannot be reconstructed safely for editing'
      using errcode = 'check_violation';
  end if;

  select jsonb_build_object(
    'orderNumber', order_row.order_number,
    'state', order_row.state,
    'locationId', order_row.location_id,
    'customerFirstName', order_row.customer_first_name,
    'comment', order_row.comment,
    'requestedPickupAt', order_row.requested_pickup_at,
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'productId', i.product_id,
          'quantity', i.quantity,
          'comment', i.comment,
          'selections', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'groupId', grouped.modifier_group_id,
                'optionIds', grouped.option_ids
              ) order by grouped.modifier_group_id
            )
            from (
              select io.modifier_group_id,
                     jsonb_agg(io.modifier_option_id order by io.id) as option_ids
              from public.order_item_options io
              where io.order_item_id = i.id
              group by io.modifier_group_id
            ) grouped
          ), '[]'::jsonb)
        ) order by i.sort, i.id
      )
      from public.order_items i
      where i.order_id = order_row.id
    ), '[]'::jsonb)
  ) into result;

  return result;
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
  requested_pickup_at timestamptz;
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

  requested_pickup_at := nullif(_payload->>'requestedPickupAt', '')::timestamptz;
  previous_pickup_at := order_row.requested_pickup_at;
  availability_at := coalesce(requested_pickup_at, now());

  perform public.server_validate_web_order_gate(
    order_row.location_id,
    requested_pickup_at,
    order_row.id
  );

  update public.orders
  set comment = nullif(trim(_payload->>'comment'), ''),
      requested_pickup_at = requested_pickup_at,
      total_cents = 0
  where id = order_row.id;

  computed_total := public.server_write_verified_order_items(
    order_row.id,
    _payload->'items',
    availability_at
  );

  update public.orders
  set total_cents = computed_total
  where id = order_row.id;

  insert into public.order_events(order_id, event_type, metadata)
  values(
    order_row.id,
    'customer_edited',
    jsonb_build_object(
      'source', 'public_token',
      'previousRequestedPickupAt', previous_pickup_at,
      'requestedPickupAt', requested_pickup_at,
      'totalCents', computed_total
    )
  );

  return public.get_public_order_status(_public_token);
end;
$$;

-- Extend public status with a non-sensitive edit capability flag. Mobile and
-- stable catalog IDs remain server-only and are never returned here.
create or replace function public.get_public_order_status(_public_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id,
    'orderNumber', o.order_number,
    'state', o.state,
    'editable', (
      o.state = 'waiting_for_acceptance'::public.order_state
      and not exists (
        select 1 from public.order_items i
        where i.order_id = o.id and i.product_id is null
      )
      and not exists (
        select 1
        from public.order_item_options io
        join public.order_items i on i.id = io.order_item_id
        where i.order_id = o.id
          and (io.modifier_group_id is null or io.modifier_option_id is null)
      )
    ),
    'customerFirstName', o.customer_first_name,
    'requestedPickupAt', o.requested_pickup_at,
    'acceptedPickupAt', o.accepted_pickup_at,
    'submittedAt', o.submitted_at,
    'acceptedAt', o.accepted_at,
    'readyAt', o.ready_at,
    'completedAt', o.completed_at,
    'rejectedAt', o.rejected_at,
    'cancelledAt', o.cancelled_at,
    'rejectionReason', o.rejection_reason,
    'totalCents', o.total_cents,
    'payment', jsonb_build_object(
      'mode', o.payment_mode,
      'method', o.payment_method,
      'status', o.payment_status,
      'currency', o.payment_currency
    ),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'name', i.product_name_snapshot,
          'quantity', i.quantity,
          'unitPriceCents', i.unit_price_cents_snapshot,
          'lineTotalCents', i.line_total_cents,
          'comment', i.comment,
          'options', coalesce((
            select jsonb_agg(jsonb_build_object(
              'group', io.group_name_snapshot,
              'option', io.option_name_snapshot,
              'priceDeltaCents', io.price_delta_cents_snapshot
            ) order by io.id)
            from public.order_item_options io
            where io.order_item_id = i.id
          ), '[]'::jsonb)
        ) order by i.sort, i.id
      )
      from public.order_items i
      where i.order_id = o.id
    ), '[]'::jsonb)
  )
  from public.orders o
  where o.public_token = _public_token
$$;

revoke all on function public.server_validate_web_order_gate(uuid,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.server_write_verified_order_items(uuid,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.server_get_pending_order_edit_context(uuid) from public, anon, authenticated;
revoke all on function public.server_replace_pending_order(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.server_create_verified_order(jsonb) from public, anon, authenticated;
revoke all on function public.get_public_order_status(uuid) from public;

grant execute on function public.server_validate_web_order_gate(uuid,timestamptz,uuid) to service_role;
grant execute on function public.server_write_verified_order_items(uuid,jsonb,timestamptz) to service_role;
grant execute on function public.server_get_pending_order_edit_context(uuid) to service_role;
grant execute on function public.server_replace_pending_order(uuid,jsonb) to service_role;
grant execute on function public.server_create_verified_order(jsonb) to service_role;
grant execute on function public.get_public_order_status(uuid) to anon, authenticated, service_role;

-- Atomic server-side order persistence + token-scoped customer status.
-- The checkout service revalidates OTP/shop/menu/slot state first, then calls
-- server_create_verified_order with a service-role credential.

alter table public.order_items
  add column if not exists unit_price_cents_snapshot integer,
  add column if not exists line_total_cents integer;

alter table public.order_items
  add constraint order_items_unit_price_nonnegative
    check (unit_price_cents_snapshot is null or unit_price_cents_snapshot >= 0),
  add constraint order_items_line_total_nonnegative
    check (line_total_cents is null or line_total_cents >= 0);

create or replace function public.server_create_verified_order(_payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  created_order public.orders;
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
begin
  if coalesce(jsonb_array_length(_payload->'items'), 0) < 1 then
    raise exception 'order must contain at least one item' using errcode = 'check_violation';
  end if;

  if coalesce(trim(_payload->>'customerFirstName'), '') = '' then
    raise exception 'customer first name required' using errcode = 'check_violation';
  end if;

  if coalesce(trim(_payload->>'mobile'), '') = '' then
    raise exception 'mobile required' using errcode = 'check_violation';
  end if;

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
    (_payload->>'totalCents')::integer,
    coalesce(nullif(_payload->>'submittedAt', '')::timestamptz, now())
  ) returning * into created_order;

  for item in select value from jsonb_array_elements(_payload->'items') loop
    item_quantity := (item->>'quantity')::integer;
    item_unit_price := (item->>'unitPriceCentsSnapshot')::integer;
    item_line_total := (item->>'lineTotalCents')::integer;

    if item_quantity < 1 or item_quantity > 99 then
      raise exception 'invalid item quantity' using errcode = 'check_violation';
    end if;
    if item_unit_price < 0 or item_line_total <> item_unit_price * item_quantity then
      raise exception 'invalid item price snapshot' using errcode = 'check_violation';
    end if;

    select * into product_row
    from public.menu_products
    where id = (item->>'productId')::uuid
      and location_id = created_order.location_id;

    if product_row.id is null then
      raise exception 'product not found for location' using errcode = 'foreign_key_violation';
    end if;

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
      created_order.id,
      product_row.id,
      coalesce(nullif(item->>'productNameSnapshot',''), product_row.name),
      product_row.base_price_cents,
      item_unit_price,
      item_line_total,
      item_quantity,
      nullif(trim(item->>'comment'), ''),
      coalesce((item->>'sort')::integer, 0)
    ) returning id into created_item_id;

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

      for option_id_text in select jsonb_array_elements_text(coalesce(selection->'optionIds','[]'::jsonb)) loop
        select * into option_row
        from public.modifier_options
        where id = option_id_text::uuid
          and group_id = group_row.id;

        if option_row.id is null then
          raise exception 'modifier option not found in group' using errcode = 'check_violation';
        end if;

        insert into public.order_item_options (
          order_item_id,
          group_name_snapshot,
          option_name_snapshot,
          price_delta_cents_snapshot
        ) values (
          created_item_id,
          group_row.name,
          option_row.name,
          option_row.price_delta_cents
        );
      end loop;
    end loop;

    computed_total := computed_total + item_line_total;
  end loop;

  if computed_total <> created_order.total_cents then
    raise exception 'order total does not match line totals' using errcode = 'check_violation';
  end if;

  insert into public.order_events(order_id, event_type, metadata)
  values(created_order.id, 'order_received', jsonb_build_object('source','web'));

  return created_order;
end;
$$;

-- Public status is a bearer-token view. It intentionally excludes mobile,
-- staff identities and internal event metadata.
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

create or replace function public.customer_cancel_pending_order(_public_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.orders;
begin
  update public.orders
  set state = 'cancelled', cancelled_at = now()
  where public_token = _public_token
    and state = 'waiting_for_acceptance'
  returning * into updated;

  if updated.id is null then
    raise exception 'order is not cancellable' using errcode = 'check_violation';
  end if;

  insert into public.order_events(order_id, event_type, metadata)
  values(updated.id, 'customer_cancelled', jsonb_build_object('source','public_token'));

  return public.get_public_order_status(_public_token);
end;
$$;

revoke all on function public.server_create_verified_order(jsonb) from public, anon, authenticated;
grant execute on function public.server_create_verified_order(jsonb) to service_role;

revoke all on function public.get_public_order_status(uuid) from public;
grant execute on function public.get_public_order_status(uuid) to anon, authenticated, service_role;

revoke all on function public.customer_cancel_pending_order(uuid) from public;
grant execute on function public.customer_cancel_pending_order(uuid) to anon, authenticated, service_role;

-- KDS clients authenticate as staff and subscribe to these RLS-protected tables.
-- Add them to the local/hosted Realtime publication when the publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
    ) then
      alter publication supabase_realtime add table public.orders;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_events'
    ) then
      alter publication supabase_realtime add table public.order_events;
    end if;
  end if;
end $$;

-- D043 privacy hardening: the edit draft exposed through the application does
-- not need internal location/order identifiers or immutable customer/payment fields.

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

  if order_row.id is null
     or order_row.state <> 'waiting_for_acceptance'::public.order_state
     or order_row.source <> 'web'::public.order_source
     or order_row.fulfillment <> 'pickup'::public.fulfillment_type then
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

revoke all on function public.server_get_pending_order_edit_context(uuid)
  from public, anon, authenticated;
grant execute on function public.server_get_pending_order_edit_context(uuid)
  to service_role;

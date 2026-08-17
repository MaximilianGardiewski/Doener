-- D004: provider-neutral payment state with a deliberately strict Mcello V1 boundary.
-- V1 accepts payment only on pickup. Online provider integration is represented
-- in application contracts but cannot be persisted until a later migration
-- explicitly removes/replaces orders_v1_payment_boundary.

alter table public.orders
  add column if not exists payment_mode text not null default 'pay_on_site',
  add column if not exists payment_method text not null default 'cash_or_card',
  add column if not exists payment_status text not null default 'due_on_site',
  add column if not exists payment_currency text not null default 'EUR',
  add column if not exists payment_provider_reference text;

alter table public.orders
  drop constraint if exists orders_payment_mode_known,
  drop constraint if exists orders_payment_method_known,
  drop constraint if exists orders_payment_status_known,
  drop constraint if exists orders_payment_currency_format,
  drop constraint if exists orders_v1_payment_boundary;

alter table public.orders
  add constraint orders_payment_mode_known
    check (payment_mode in ('pay_on_site', 'online')),
  add constraint orders_payment_method_known
    check (payment_method in ('cash_or_card', 'provider')),
  add constraint orders_payment_status_known
    check (payment_status in ('due_on_site', 'pending', 'authorized', 'paid', 'failed', 'refunded')),
  add constraint orders_payment_currency_format
    check (payment_currency ~ '^[A-Z]{3}$'),
  add constraint orders_v1_payment_boundary
    check (
      payment_mode = 'pay_on_site'
      and payment_method = 'cash_or_card'
      and payment_status = 'due_on_site'
      and payment_currency = 'EUR'
      and payment_provider_reference is null
    );

comment on column public.orders.payment_mode is
  'Provider-neutral payment mode. Mcello V1 DB constraint permits only pay_on_site.';
comment on column public.orders.payment_method is
  'Customer settles on site by cash or card in V1; provider is reserved for later online payment.';
comment on column public.orders.payment_provider_reference is
  'Reserved provider reference for future online payment. Must remain null in Mcello V1.';
comment on constraint orders_v1_payment_boundary on public.orders is
  'D004 hard boundary: online payment cannot be stored until a deliberate future migration changes this constraint.';

-- Extend the bearer-token public status contract with non-sensitive payment
-- semantics. Provider references are intentionally never exposed publicly.
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

revoke all on function public.get_public_order_status(uuid) from public;
grant execute on function public.get_public_order_status(uuid) to anon, authenticated, service_role;

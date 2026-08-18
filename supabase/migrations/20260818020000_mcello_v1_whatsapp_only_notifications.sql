-- Mcello V1 messaging is WhatsApp-only.
-- Keep the provider-neutral columns for a future explicitly approved migration,
-- but make the effective V1 database state reject SMS and enqueue no fallback.

update public.order_notification_outbox
set
  preferred_channel = 'whatsapp',
  fallback_channel = null,
  updated_at = now()
where preferred_channel is distinct from 'whatsapp'
   or fallback_channel is not null;

alter table public.order_notification_outbox
  drop constraint if exists order_notification_outbox_mcello_v1_whatsapp_only;

alter table public.order_notification_outbox
  add constraint order_notification_outbox_mcello_v1_whatsapp_only
  check (preferred_channel = 'whatsapp' and fallback_channel is null);

create or replace function public.enqueue_order_notification(
  _order public.orders,
  _kind text,
  _dedupe_key text,
  _extra jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _kind not in ('received','accepted','delayed','ready','rejected','cancelled') then
    raise exception 'unsupported notification kind' using errcode = 'check_violation';
  end if;

  insert into public.order_notification_outbox (
    order_id,
    kind,
    preferred_channel,
    fallback_channel,
    mobile_snapshot,
    public_token_snapshot,
    payload,
    dedupe_key
  ) values (
    _order.id,
    _kind,
    'whatsapp',
    null,
    _order.mobile,
    _order.public_token,
    jsonb_strip_nulls(
      jsonb_build_object(
        'orderId', _order.id,
        'orderNumber', _order.order_number,
        'state', _order.state,
        'requestedPickupAt', _order.requested_pickup_at,
        'acceptedPickupAt', _order.accepted_pickup_at,
        'rejectionReason', _order.rejection_reason,
        'totalCents', _order.total_cents
      ) || coalesce(_extra, '{}'::jsonb)
    ),
    _dedupe_key
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function public.enqueue_order_notification(public.orders,text,text,jsonb)
  from public, anon, authenticated;

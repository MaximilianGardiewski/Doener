-- Provider-neutral transactional notification outbox.
-- Business state changes enqueue durable jobs; transport workers may later use
-- WhatsApp Business + SMS fallback without coupling providers to the order core.

create table if not exists public.order_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('received','accepted','delayed','ready','rejected','cancelled')),
  preferred_channel text not null default 'whatsapp' check (preferred_channel in ('whatsapp','sms')),
  fallback_channel text check (fallback_channel in ('whatsapp','sms')),
  mobile_snapshot text not null,
  public_token_snapshot uuid not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_order_notification_outbox_pending
  on public.order_notification_outbox(status, next_attempt_at, created_at);
create index if not exists idx_order_notification_outbox_order
  on public.order_notification_outbox(order_id, created_at);

alter table public.order_notification_outbox enable row level security;
revoke all on public.order_notification_outbox from public, anon, authenticated;
grant all on public.order_notification_outbox to service_role;

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
    'sms',
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

create or replace function public.on_order_notification_outbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.enqueue_order_notification(
      new,
      'received',
      new.id::text || ':received',
      jsonb_build_object('submittedAt', new.submitted_at)
    );
    return new;
  end if;

  if old.state = 'waiting_for_acceptance'
     and new.state in ('scheduled','preparing') then
    perform public.enqueue_order_notification(
      new,
      'accepted',
      new.id::text || ':accepted:' || coalesce(new.accepted_at::text, new.updated_at::text),
      jsonb_build_object('acceptedAt', new.accepted_at)
    );
  elsif old.accepted_pickup_at is distinct from new.accepted_pickup_at
        and old.state = new.state
        and new.state in ('scheduled','preparing')
        and new.accepted_pickup_at is not null then
    perform public.enqueue_order_notification(
      new,
      'delayed',
      new.id::text || ':delayed:' || new.accepted_pickup_at::text,
      '{}'::jsonb
    );
  end if;

  if old.state is distinct from new.state then
    if new.state = 'ready' then
      perform public.enqueue_order_notification(new, 'ready', new.id::text || ':ready', '{}'::jsonb);
    elsif new.state = 'rejected' then
      perform public.enqueue_order_notification(new, 'rejected', new.id::text || ':rejected', '{}'::jsonb);
    elsif new.state = 'cancelled' then
      perform public.enqueue_order_notification(new, 'cancelled', new.id::text || ':cancelled', '{}'::jsonb);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.enqueue_order_notification(public.orders,text,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.on_order_notification_outbox()
  from public, anon, authenticated;

-- AFTER trigger ensures defaults such as public_token/order_number are already present.
drop trigger if exists t_orders_notification_outbox on public.orders;
create trigger t_orders_notification_outbox
after insert or update on public.orders
for each row execute function public.on_order_notification_outbox();

create or replace function public.server_claim_notification_outbox(_limit integer default 20)
returns setof public.order_notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimable as (
    select o.id
    from public.order_notification_outbox o
    where o.status = 'pending'
      and o.next_attempt_at <= now()
    order by o.created_at
    for update skip locked
    limit greatest(1, least(coalesce(_limit, 20), 100))
  ), updated as (
    update public.order_notification_outbox o
    set
      status = 'processing',
      claimed_at = now(),
      attempt_count = o.attempt_count + 1,
      updated_at = now()
    from claimable c
    where o.id = c.id
    returning o.*
  )
  select * from updated;
end;
$$;

create or replace function public.server_mark_notification_sent(_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.order_notification_outbox
  set
    status = 'sent',
    sent_at = now(),
    claimed_at = null,
    last_error = null,
    updated_at = now()
  where id = _id and status = 'processing';
end;
$$;

create or replace function public.server_mark_notification_failed(_id uuid, _error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.order_notification_outbox
  set
    status = case when attempt_count >= 5 then 'failed' else 'pending' end,
    next_attempt_at = case
      when attempt_count >= 5 then next_attempt_at
      else now() + make_interval(secs => least(600, greatest(30, attempt_count * 30)))
    end,
    claimed_at = null,
    last_error = left(coalesce(_error, 'unknown transport error'), 1000),
    updated_at = now()
  where id = _id and status = 'processing';
end;
$$;

revoke all on function public.server_claim_notification_outbox(integer) from public, anon, authenticated;
revoke all on function public.server_mark_notification_sent(uuid) from public, anon, authenticated;
revoke all on function public.server_mark_notification_failed(uuid,text) from public, anon, authenticated;
grant execute on function public.server_claim_notification_outbox(integer) to service_role;
grant execute on function public.server_mark_notification_sent(uuid) to service_role;
grant execute on function public.server_mark_notification_failed(uuid,text) to service_role;

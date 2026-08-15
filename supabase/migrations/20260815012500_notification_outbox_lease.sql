-- Recover notification jobs when a worker crashes after claiming them.
-- Delivery remains at-least-once; the transport receives the stable outbox
-- dedupe_key so providers with idempotency support can suppress duplicates.

create index if not exists idx_order_notification_outbox_processing_lease
  on public.order_notification_outbox(status, claimed_at)
  where status = 'processing';

create or replace function public.server_claim_notification_outbox(_limit integer default 20)
returns setof public.order_notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A worker owns a processing job for five minutes. If it disappears before
  -- mark_sent/mark_failed, release the lease for another attempt. Five claimed
  -- attempts is the terminal retry budget.
  update public.order_notification_outbox n
  set
    status = case when n.attempt_count >= 5 then 'failed' else 'pending' end,
    claimed_at = null,
    next_attempt_at = case
      when n.attempt_count >= 5 then n.next_attempt_at
      else now()
    end,
    last_error = case
      when n.attempt_count >= 5 then 'notification worker lease expired after retry budget'
      else 'notification worker lease expired; retrying'
    end,
    updated_at = now()
  where n.status = 'processing'
    and (n.claimed_at is null or n.claimed_at <= now() - interval '5 minutes');

  return query
  with claimable as (
    select n.id
    from public.order_notification_outbox n
    join public.orders o on o.id = n.order_id
    where n.status = 'pending'
      and n.next_attempt_at <= now()
    order by
      case
        when o.state in ('waiting_for_acceptance','scheduled','preparing','ready') then 0
        else 1
      end,
      n.created_at
    for update of n skip locked
    limit greatest(1, least(coalesce(_limit, 20), 100))
  ), updated as (
    update public.order_notification_outbox n
    set
      status = 'processing',
      claimed_at = now(),
      attempt_count = n.attempt_count + 1,
      updated_at = now()
    from claimable c
    where n.id = c.id
    returning n.*
  )
  select * from updated;
end;
$$;

revoke all on function public.server_claim_notification_outbox(integer) from public, anon, authenticated;
grant execute on function public.server_claim_notification_outbox(integer) to service_role;

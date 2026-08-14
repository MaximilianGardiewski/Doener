-- Active customer journeys take precedence over historical terminal jobs.
-- Within the same priority the outbox remains FIFO.

create or replace function public.server_claim_notification_outbox(_limit integer default 20)
returns setof public.order_notification_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
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

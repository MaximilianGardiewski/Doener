-- D047/D050 prepare analytics-ready event data without an external tracker.
-- Events are deliberately pseudonymous and structurally exclude free-form metadata.

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null unique,
  location_id uuid not null references public.locations(id) on delete cascade,
  anonymous_session_id uuid not null,
  event_type text not null check (event_type in (
    'menu_view',
    'product_view',
    'recommendation_impression',
    'recommendation_select',
    'cart_add',
    'checkout_started',
    'order_submitted'
  )),
  product_id uuid references public.menu_products(id) on delete cascade,
  source_product_id uuid references public.menu_products(id) on delete cascade,
  cross_sell_rule_id uuid references public.cross_sell_rules(id) on delete set null,
  order_id uuid references public.orders(id) on delete cascade,
  surface text check (surface is null or surface in ('product_modal', 'cart')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint analytics_events_product_required check (
    event_type not in ('product_view', 'cart_add', 'recommendation_impression', 'recommendation_select')
    or product_id is not null
  ),
  constraint analytics_events_recommendation_shape check (
    (
      event_type in ('recommendation_impression', 'recommendation_select')
      and product_id is not null
      and source_product_id is not null
      and surface is not null
    ) or (
      event_type not in ('recommendation_impression', 'recommendation_select')
      and source_product_id is null
      and cross_sell_rule_id is null
      and surface is null
    )
  ),
  constraint analytics_events_non_product_shape check (
    event_type not in ('menu_view', 'checkout_started', 'order_submitted') or product_id is null
  ),
  constraint analytics_events_order_shape check (
    (event_type = 'order_submitted' and order_id is not null)
    or (event_type <> 'order_submitted' and order_id is null)
  )
);

create index analytics_events_location_type_time_idx
on public.analytics_events (location_id, event_type, occurred_at desc);

create index analytics_events_session_time_idx
on public.analytics_events (anonymous_session_id, occurred_at desc);

create index analytics_events_product_time_idx
on public.analytics_events (product_id, occurred_at desc)
where product_id is not null;

create index analytics_events_source_product_time_idx
on public.analytics_events (source_product_id, occurred_at desc)
where source_product_id is not null;

create index analytics_events_cross_sell_rule_time_idx
on public.analytics_events (cross_sell_rule_id, occurred_at desc)
where cross_sell_rule_id is not null;

create index analytics_events_order_idx
on public.analytics_events (order_id)
where order_id is not null;

alter table public.analytics_events enable row level security;

revoke all on public.analytics_events from public, anon, authenticated;
grant select, insert on public.analytics_events to service_role;

create or replace function public.server_record_analytics_event(
  _payload jsonb,
  _order_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recorded_id uuid;
  event_name text := coalesce(_payload->>'eventName', '');
  event_location_id uuid;
  event_client_id uuid;
  event_session_id uuid;
  event_product_id uuid;
  event_source_product_id uuid;
  event_rule_id uuid;
  event_surface text;
  event_occurred_at timestamptz;
begin
  if _payload is null or jsonb_typeof(_payload) <> 'object' then
    raise exception 'analytics payload must be an object' using errcode = 'check_violation';
  end if;

  if _payload - array[
    'clientEventId', 'anonymousSessionId', 'locationId', 'eventName', 'occurredAt',
    'productId', 'sourceProductId', 'crossSellRuleId', 'surface'
  ] <> '{}'::jsonb then
    raise exception 'analytics payload contains unsupported fields' using errcode = 'check_violation';
  end if;

  if event_name not in (
    'menu_view', 'product_view', 'recommendation_impression', 'recommendation_select',
    'cart_add', 'checkout_started', 'order_submitted'
  ) then
    raise exception 'unsupported analytics event' using errcode = 'check_violation';
  end if;

  begin
    event_client_id := (_payload->>'clientEventId')::uuid;
    event_session_id := (_payload->>'anonymousSessionId')::uuid;
    event_location_id := (_payload->>'locationId')::uuid;
    event_product_id := nullif(_payload->>'productId', '')::uuid;
    event_source_product_id := nullif(_payload->>'sourceProductId', '')::uuid;
    event_rule_id := nullif(_payload->>'crossSellRuleId', '')::uuid;
    event_occurred_at := (_payload->>'occurredAt')::timestamptz;
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception 'analytics identifiers or timestamp are invalid' using errcode = 'check_violation';
  end;
  event_surface := nullif(_payload->>'surface', '');

  if event_occurred_at < now() - interval '24 hours'
     or event_occurred_at > now() + interval '5 minutes' then
    raise exception 'analytics timestamp is outside the accepted window' using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.locations l where l.id = event_location_id) then
    raise exception 'analytics location not found' using errcode = 'foreign_key_violation';
  end if;

  if event_product_id is not null and not exists (
    select 1 from public.menu_products p
    where p.id = event_product_id and p.location_id = event_location_id and p.status = 'published'
  ) then
    raise exception 'analytics product is not public for location' using errcode = 'foreign_key_violation';
  end if;

  if event_source_product_id is not null and not exists (
    select 1 from public.menu_products p
    where p.id = event_source_product_id and p.location_id = event_location_id and p.status = 'published'
  ) then
    raise exception 'analytics source product is not public for location' using errcode = 'foreign_key_violation';
  end if;

  if event_rule_id is not null and not exists (
    select 1 from public.cross_sell_rules r
    where r.id = event_rule_id and r.location_id = event_location_id and r.enabled
  ) then
    raise exception 'analytics recommendation rule is not active for location' using errcode = 'foreign_key_violation';
  end if;

  if event_name = 'order_submitted' then
    if _order_id is null or not exists (
      select 1 from public.orders o where o.id = _order_id and o.location_id = event_location_id
    ) then
      raise exception 'analytics order not found for location' using errcode = 'foreign_key_violation';
    end if;
  elsif _order_id is not null then
    raise exception 'only order_submitted may reference an order' using errcode = 'check_violation';
  end if;

  insert into public.analytics_events (
    client_event_id, location_id, anonymous_session_id, event_type,
    product_id, source_product_id, cross_sell_rule_id, order_id, surface, occurred_at
  ) values (
    event_client_id, event_location_id, event_session_id, event_name,
    event_product_id, event_source_product_id, event_rule_id, _order_id, event_surface, event_occurred_at
  )
  on conflict (client_event_id) do nothing
  returning id into recorded_id;

  if recorded_id is null then
    select e.id into recorded_id
    from public.analytics_events e
    where e.client_event_id = event_client_id
      and e.location_id = event_location_id
      and e.anonymous_session_id = event_session_id
      and e.event_type = event_name
      and e.product_id is not distinct from event_product_id
      and e.source_product_id is not distinct from event_source_product_id
      and e.cross_sell_rule_id is not distinct from event_rule_id
      and e.order_id is not distinct from _order_id
      and e.surface is not distinct from event_surface
      and e.occurred_at = event_occurred_at;
    if recorded_id is null then
      raise exception 'client event id was already used for a different event' using errcode = 'unique_violation';
    end if;
  end if;

  return recorded_id;
end;
$$;

revoke all on function public.server_record_analytics_event(jsonb,uuid) from public, anon, authenticated;
grant execute on function public.server_record_analytics_event(jsonb,uuid) to service_role;

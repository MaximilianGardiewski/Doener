-- D006 prepared-now boundary.
-- The reusable order model already recognizes pickup/delivery, but Mcello V1
-- deliberately remains pickup-only. A future delivery release must explicitly
-- replace this constraint after wiring a DeliveryZoneResolver and delivery UI.

alter table public.orders
  drop constraint if exists orders_v1_pickup_only;

alter table public.orders
  add constraint orders_v1_pickup_only
    check (fulfillment = 'pickup');

comment on type public.fulfillment_type is
  'Reusable fulfillment contract. Mcello V1 persists pickup only; delivery is reserved for a later PLZ/radius-zone implementation.';
comment on column public.orders.fulfillment is
  'Immutable fulfillment origin. Mcello V1 database constraint permits pickup only.';
comment on constraint orders_v1_pickup_only on public.orders is
  'D006 hard boundary: delivery cannot be persisted until a deliberate future migration enables it.';

create or replace function public.prevent_fulfillment_reassignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.fulfillment is distinct from old.fulfillment then
    raise exception 'order fulfillment is immutable'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_fulfillment_reassignment() from public, anon, authenticated;

drop trigger if exists orders_prevent_fulfillment_reassignment on public.orders;
create trigger orders_prevent_fulfillment_reassignment
before update of fulfillment on public.orders
for each row execute function public.prevent_fulfillment_reassignment();

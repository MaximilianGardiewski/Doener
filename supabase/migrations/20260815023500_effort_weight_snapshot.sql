-- D040 prepared-now boundary: keep optional kitchen-effort metadata available
-- for a later weighted-capacity policy without changing Mcello V1 slot admission.

alter table public.menu_products
  add constraint menu_products_effort_weight_positive
  check (effort_weight is null or effort_weight > 0);

alter table public.order_items
  add column if not exists effort_weight_snapshot numeric(8,2),
  add constraint order_items_effort_weight_snapshot_positive
  check (effort_weight_snapshot is null or effort_weight_snapshot > 0);

comment on column public.menu_products.effort_weight is
  'Optional kitchen-effort metadata reserved for future weighted capacity; unused by V1 slot admission.';
comment on column public.order_items.effort_weight_snapshot is
  'Product effort captured when the order item is created; unused by V1 slot admission.';

create or replace function public.snapshot_order_item_effort_weight()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.product_id is not null then
    select effort_weight into new.effort_weight_snapshot
    from public.menu_products
    where id = new.product_id;
  else
    new.effort_weight_snapshot := null;
  end if;
  return new;
end;
$$;

revoke all on function public.snapshot_order_item_effort_weight() from public, anon, authenticated;

drop trigger if exists order_items_snapshot_effort_weight on public.order_items;
create trigger order_items_snapshot_effort_weight
before insert on public.order_items
for each row execute function public.snapshot_order_item_effort_weight();

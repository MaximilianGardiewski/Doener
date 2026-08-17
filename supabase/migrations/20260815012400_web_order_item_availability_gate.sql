-- Database-level product availability guard for web order items.
-- The application validates availability for UX, but a privileged caller must not
-- be able to persist a product outside its configured pickup-time window.

create or replace function public.protect_web_order_item_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_order public.orders;
  availability_at timestamptz;
begin
  if new.product_id is null then
    return new;
  end if;

  select * into parent_order
  from public.orders
  where id = new.order_id;

  if parent_order.id is null or parent_order.source <> 'web'::public.order_source then
    return new;
  end if;

  if not exists (
    select 1
    from public.menu_products p
    where p.id = new.product_id
      and p.location_id = parent_order.location_id
  ) then
    raise exception 'product does not belong to order location'
      using errcode = 'foreign_key_violation';
  end if;

  availability_at := coalesce(parent_order.requested_pickup_at, parent_order.submitted_at, now());

  if not public.server_is_product_available(new.product_id, availability_at) then
    raise exception 'product unavailable for order pickup time'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_web_order_item_availability() from public, anon, authenticated;

drop trigger if exists t_order_items_web_availability on public.order_items;
create trigger t_order_items_web_availability
before insert or update of order_id, product_id on public.order_items
for each row execute function public.protect_web_order_item_availability();

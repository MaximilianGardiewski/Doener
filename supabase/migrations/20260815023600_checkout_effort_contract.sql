-- D027/D040 contract exposure. Order-source enum already contains web/counter/table;
-- Mcello V1 checkout still hardcodes web. Checkout product now exposes the
-- optional effort metadata so it can be carried into the order snapshot.

comment on type public.order_source is
  'Reusable order-origin contract: web now; counter/table reserved for later interfaces.';
comment on column public.orders.source is
  'Current Mcello public checkout creates web orders; counter/table remain future immutable origins.';

create or replace function public.prevent_order_source_reassignment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source is distinct from old.source then
    raise exception 'order source is immutable'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_order_source_reassignment() from public, anon, authenticated;

drop trigger if exists orders_prevent_source_reassignment on public.orders;
create trigger orders_prevent_source_reassignment
before update of source on public.orders
for each row execute function public.prevent_order_source_reassignment();

create or replace function public.server_get_checkout_product(_product_id uuid, _at timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'categoryId', p.category_id,
    'name', p.name,
    'description', p.description,
    'basePriceCents', p.base_price_cents,
    'bestseller', p.bestseller,
    'soldOut', exists (
      select 1 from public.snoozes s
      where s.product_id = p.id and s.until_at > _at
    ),
    'dietaryTags', to_jsonb(p.dietary_tags),
    'ownerConfirmed', p.owner_confirmed,
    'sourceNote', p.source_note,
    'effortWeight', p.effort_weight,
    'modifierGroups', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'name', g.name,
          'minSelections', g.min_selections,
          'maxSelections', g.max_selections,
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', o.id,
                'name', o.name,
                'priceDeltaCents', o.price_delta_cents,
                'defaultSelected', o.default_selected,
                'soldOut', exists (
                  select 1 from public.snoozes s
                  where s.modifier_option_id = o.id and s.until_at > _at
                )
              ) order by o.sort, o.id
            )
            from public.modifier_options o
            where o.group_id = g.id and o.active
          ), '[]'::jsonb)
        ) order by pmg.sort, g.sort, g.id
      )
      from public.product_modifier_groups pmg
      join public.modifier_groups g on g.id = pmg.group_id
      where pmg.product_id = p.id
    ), '[]'::jsonb)
  )
  from public.menu_products p
  where p.id = _product_id
    and p.status = 'published'
    and p.orderable_online
$$;

revoke all on function public.server_get_checkout_product(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.server_get_checkout_product(uuid,timestamptz) to service_role;

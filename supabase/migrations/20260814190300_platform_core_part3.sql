-- Staff/admin management policies.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'locations',
    'opening_hours',
    'special_opening_hours',
    'menu_categories',
    'menu_products',
    'modifier_groups',
    'modifier_options',
    'product_modifier_groups',
    'allergens',
    'product_allergens',
    'modifier_option_allergens',
    'availability_rules',
    'product_cross_sells',
    'editorial_posts',
    'homepage_sections'
  ] loop
    execute format(
      'create policy "admin manage %1$s" on public.%1$I for all to authenticated using (public.has_role(auth.uid(), ''admin'')) with check (public.has_role(auth.uid(), ''admin''))',
      table_name
    );
  end loop;
end $$;

-- Staff may operate snoozes, settings and orders. Admin can also do so via is_staff().
alter table public.snoozes enable row level security;
alter table public.ordering_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_options enable row level security;
alter table public.order_events enable row level security;

grant select, insert, update, delete on public.snoozes, public.ordering_settings,
  public.orders, public.order_items, public.order_item_options, public.order_events
to authenticated;

create policy "staff manage snoozes" on public.snoozes
for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "staff manage ordering settings" on public.ordering_settings
for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "staff read orders" on public.orders
for select to authenticated using (public.is_staff());

create policy "staff update orders" on public.orders
for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "staff read order items" on public.order_items
for select to authenticated using (
  public.is_staff()
  and exists (select 1 from public.orders o where o.id = order_items.order_id)
);

create policy "staff read order item options" on public.order_item_options
for select to authenticated using (
  public.is_staff()
  and exists (
    select 1
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where i.id = order_item_options.order_item_id
  )
);

create policy "staff read order events" on public.order_events
for select to authenticated using (
  public.is_staff()
  and exists (select 1 from public.orders o where o.id = order_events.order_id)
);

-- No anonymous direct order read/write policies.
-- Server-side API performs OTP verification, price/availability revalidation and order insert.

-- Function ACLs
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
revoke all on function public.is_staff() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_last_admin() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.is_bootstrap_open() from public, anon;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_bootstrap_open() to authenticated;

grant all on public.profiles, public.user_roles, public.locations, public.opening_hours,
  public.special_opening_hours, public.ordering_settings, public.menu_categories,
  public.menu_products, public.modifier_groups, public.modifier_options,
  public.product_modifier_groups, public.allergens, public.product_allergens,
  public.modifier_option_allergens, public.availability_rules, public.snoozes,
  public.product_cross_sells, public.orders, public.order_items, public.order_item_options,
  public.order_events, public.editorial_posts, public.homepage_sections
to service_role;

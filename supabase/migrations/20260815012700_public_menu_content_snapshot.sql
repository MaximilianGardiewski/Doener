-- Keep one public bootstrap snapshot for the customer app.
-- Menu/product availability is evaluated at _at (possibly a future pickup slot),
-- while editorial publication remains evaluated at the actual current time.

create or replace function public.get_public_menu(_location_id uuid, _at timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'locationId', _location_id,
    'generatedAt', _at,
    'content', public.get_public_content(_location_id, now()),
    'categories', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'slug', c.slug,
          'name', c.name,
          'description', c.description,
          'sort', c.sort,
          'products', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', p.id,
                'slug', p.slug,
                'name', p.name,
                'description', p.description,
                'basePriceCents', p.base_price_cents,
                'bestseller', p.bestseller,
                'orderableOnline', p.orderable_online,
                'ownerConfirmed', p.owner_confirmed,
                'dietaryTags', to_jsonb(p.dietary_tags),
                'soldOut', exists (
                  select 1 from public.snoozes s
                  where s.product_id = p.id and s.until_at > _at
                ),
                'availableNow', case
                  when p.orderable_online then public.server_is_product_available(p.id, _at)
                  else false
                end,
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
              ) order by p.sort, p.id
            )
            from public.menu_products p
            where p.location_id = _location_id
              and p.category_id = c.id
              and p.status = 'published'
          ), '[]'::jsonb)
        ) order by c.sort, c.id
      )
      from public.menu_categories c
      where c.location_id = _location_id
        and c.status = 'published'
        and c.visible
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.get_public_menu(uuid,timestamptz) from public;
grant execute on function public.get_public_menu(uuid,timestamptz) to anon, authenticated, service_role;

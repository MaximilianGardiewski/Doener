-- D020: rights-aware product image management using the existing private mcello-media bucket.
-- Storage objects remain managed through the Storage API; SQL owns only metadata,
-- product assignment and the public eligibility boundary.

create or replace function public.admin_get_product_media(_location_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  return jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'status', p.status,
          'sort', p.sort,
          'image', case when m.id is null then null else jsonb_build_object(
            'id', m.id,
            'bucketId', m.bucket_id,
            'objectPath', m.object_path,
            'originalFilename', m.original_filename,
            'mimeType', m.mime_type,
            'byteSize', m.byte_size,
            'width', m.width,
            'height', m.height,
            'altText', m.alt_text,
            'sourceKind', m.source_kind,
            'rightsConfirmed', m.rights_confirmed
          ) end
        ) order by p.sort, p.name, p.id
      )
      from public.menu_products p
      left join public.media_assets m on m.id = p.image_media_id
      where p.location_id = _location_id
        and p.status <> 'archived'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_register_product_image_upload(
  _product_id uuid,
  _location_id uuid,
  _bucket_id text,
  _object_path text,
  _original_filename text,
  _mime_type text,
  _byte_size bigint,
  _width integer,
  _height integer,
  _alt_text text,
  _source_kind text,
  _rights_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.menu_products;
  asset public.media_assets;
  previous public.media_assets;
  expected_prefix text := _location_id::text || '/products/';
  delete_previous boolean := false;
begin
  perform public.require_admin();

  select * into product_row
  from public.menu_products p
  where p.id = _product_id and p.location_id = _location_id
  for update;

  if product_row.id is null then
    raise exception 'product not found' using errcode = 'no_data_found';
  end if;

  if _bucket_id <> 'mcello-media'
     or left(_object_path, length(expected_prefix)) <> expected_prefix
     or _object_path !~ '^[0-9a-f-]{36}/products/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|avif)$' then
    raise exception 'invalid product image storage path' using errcode = 'check_violation';
  end if;
  if _mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
     or _byte_size not between 1 and 10485760 then
    raise exception 'invalid product image type or size' using errcode = 'check_violation';
  end if;
  if coalesce(trim(_original_filename), '') = '' or length(_original_filename) > 255 then
    raise exception 'original filename required' using errcode = 'check_violation';
  end if;
  if coalesce(trim(_alt_text), '') = '' or length(_alt_text) > 250 then
    raise exception 'product image alt text is required and limited to 250 characters' using errcode = 'check_violation';
  end if;
  if _source_kind not in ('owner_upload', 'user_supplied', 'licensed') then
    raise exception 'invalid product image source' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = _bucket_id and o.name = _object_path
  ) then
    raise exception 'uploaded storage object not found' using errcode = 'no_data_found';
  end if;

  if product_row.image_media_id is not null then
    select * into previous from public.media_assets m where m.id = product_row.image_media_id;
  end if;

  insert into public.media_assets(
    location_id, bucket_id, object_path, original_filename, mime_type,
    byte_size, width, height, alt_text, source_kind, rights_confirmed, uploaded_by
  ) values (
    _location_id, _bucket_id, _object_path, trim(_original_filename), _mime_type,
    _byte_size, _width, _height, trim(_alt_text), _source_kind,
    coalesce(_rights_confirmed, false), (select auth.uid())
  ) returning * into asset;

  update public.menu_products
  set image_media_id = asset.id
  where id = product_row.id and location_id = _location_id;

  if previous.id is not null
     and not exists (select 1 from public.menu_products p where p.image_media_id = previous.id)
     and not exists (select 1 from public.gallery_items g where g.media_id = previous.id)
     and not exists (select 1 from public.editorial_posts e where e.image_media_id = previous.id) then
    delete from public.media_assets m where m.id = previous.id;
    delete_previous := true;
  end if;

  return jsonb_build_object(
    'productId', product_row.id,
    'mediaId', asset.id,
    'image', jsonb_build_object(
      'id', asset.id,
      'bucketId', asset.bucket_id,
      'objectPath', asset.object_path,
      'altText', asset.alt_text,
      'sourceKind', asset.source_kind,
      'rightsConfirmed', asset.rights_confirmed
    ),
    'deletePreviousObject', delete_previous,
    'previousBucketId', case when delete_previous then previous.bucket_id else null end,
    'previousObjectPath', case when delete_previous then previous.object_path else null end
  );
end;
$$;

create or replace function public.admin_save_product_image_metadata(
  _product_id uuid,
  _location_id uuid,
  _alt_text text,
  _source_kind text,
  _rights_confirmed boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset public.media_assets;
begin
  perform public.require_admin();

  if coalesce(trim(_alt_text), '') = '' or length(_alt_text) > 250 then
    raise exception 'product image alt text is required and limited to 250 characters' using errcode = 'check_violation';
  end if;
  if _source_kind not in ('owner_upload', 'user_supplied', 'licensed') then
    raise exception 'invalid product image source' using errcode = 'check_violation';
  end if;

  update public.media_assets m
  set alt_text = trim(_alt_text),
      source_kind = _source_kind,
      rights_confirmed = coalesce(_rights_confirmed, false)
  where m.id = (
    select p.image_media_id
    from public.menu_products p
    where p.id = _product_id and p.location_id = _location_id
  )
    and m.location_id = _location_id
  returning * into asset;

  if asset.id is null then
    raise exception 'product image not found' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'productId', _product_id,
    'mediaId', asset.id,
    'altText', asset.alt_text,
    'sourceKind', asset.source_kind,
    'rightsConfirmed', asset.rights_confirmed
  );
end;
$$;

create or replace function public.admin_remove_product_image(
  _product_id uuid,
  _location_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.menu_products;
  previous public.media_assets;
  delete_object boolean := false;
begin
  perform public.require_admin();

  select * into product_row
  from public.menu_products p
  where p.id = _product_id and p.location_id = _location_id
  for update;

  if product_row.id is null then
    raise exception 'product not found' using errcode = 'no_data_found';
  end if;
  if product_row.image_media_id is null then
    return jsonb_build_object('productId', product_row.id, 'removed', false, 'deleteObject', false);
  end if;

  select * into previous from public.media_assets m where m.id = product_row.image_media_id;

  update public.menu_products
  set image_media_id = null
  where id = product_row.id and location_id = _location_id;

  if previous.id is not null
     and not exists (select 1 from public.menu_products p where p.image_media_id = previous.id)
     and not exists (select 1 from public.gallery_items g where g.media_id = previous.id)
     and not exists (select 1 from public.editorial_posts e where e.image_media_id = previous.id) then
    delete from public.media_assets m where m.id = previous.id;
    delete_object := true;
  end if;

  return jsonb_build_object(
    'productId', product_row.id,
    'removed', true,
    'deleteObject', delete_object,
    'bucketId', previous.bucket_id,
    'objectPath', previous.object_path
  );
end;
$$;

-- Public media may be streamed when it is rights-confirmed and used either by a
-- currently published gallery item or by a product in a published/visible category.
create or replace function public.get_public_media_descriptor(_media_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'bucketId', m.bucket_id,
    'objectPath', m.object_path,
    'mimeType', m.mime_type,
    'byteSize', m.byte_size
  )
  from public.media_assets m
  where m.id = _media_id
    and m.rights_confirmed
    and trim(m.alt_text) <> ''
    and (
      exists (
        select 1 from public.gallery_items g
        where g.media_id = m.id
          and g.status = 'published'
          and (g.visible_from is null or g.visible_from <= now())
          and (g.visible_until is null or g.visible_until >= now())
      )
      or exists (
        select 1
        from public.menu_products p
        join public.menu_categories c on c.id = p.category_id
        where p.image_media_id = m.id
          and p.status = 'published'
          and c.status = 'published'
          and c.visible
      )
    )
  limit 1
$$;

-- Preserve the full public menu contract (content, labels/allergens, modifiers)
-- and add only safe product-image fields.
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
                'allergens', coalesce((
                  select jsonb_agg(
                    jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name)
                    order by coalesce(a.code, ''), a.name
                  )
                  from public.product_allergens pa
                  join public.allergens a on a.id = pa.allergen_id
                  where pa.product_id = p.id
                ), '[]'::jsonb),
                'imageMediaId', (
                  select m.id
                  from public.media_assets m
                  where m.id = p.image_media_id
                    and m.rights_confirmed
                    and trim(m.alt_text) <> ''
                  limit 1
                ),
                'imageAltText', (
                  select m.alt_text
                  from public.media_assets m
                  where m.id = p.image_media_id
                    and m.rights_confirmed
                    and trim(m.alt_text) <> ''
                  limit 1
                ),
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
                            'allergens', coalesce((
                              select jsonb_agg(
                                jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name)
                                order by coalesce(a.code, ''), a.name
                              )
                              from public.modifier_option_allergens moa
                              join public.allergens a on a.id = moa.allergen_id
                              where moa.option_id = o.id
                            ), '[]'::jsonb),
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

revoke all on function public.admin_get_product_media(uuid) from public, anon;
revoke all on function public.admin_register_product_image_upload(uuid,uuid,text,text,text,text,bigint,integer,integer,text,text,boolean) from public, anon;
revoke all on function public.admin_save_product_image_metadata(uuid,uuid,text,text,boolean) from public, anon;
revoke all on function public.admin_remove_product_image(uuid,uuid) from public, anon;
grant execute on function public.admin_get_product_media(uuid) to authenticated;
grant execute on function public.admin_register_product_image_upload(uuid,uuid,text,text,text,text,bigint,integer,integer,text,text,boolean) to authenticated;
grant execute on function public.admin_save_product_image_metadata(uuid,uuid,text,text,boolean) to authenticated;
grant execute on function public.admin_remove_product_image(uuid,uuid) to authenticated;

-- Preserve public/server ACLs after CREATE OR REPLACE.
revoke all on function public.get_public_media_descriptor(uuid) from public;
grant execute on function public.get_public_media_descriptor(uuid) to anon, authenticated, service_role;
revoke all on function public.get_public_menu(uuid,timestamptz) from public;
grant execute on function public.get_public_menu(uuid,timestamptz) to anon, authenticated, service_role;

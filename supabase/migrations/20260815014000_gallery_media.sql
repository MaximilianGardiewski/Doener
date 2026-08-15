-- Rights-aware gallery + private media storage.
-- Storage objects are created/deleted through the Storage API; this migration only
-- owns application metadata and RLS policies.

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  bucket_id text not null default 'mcello-media',
  object_path text not null,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null,
  width integer,
  height integer,
  alt_text text not null default '',
  source_kind text not null,
  rights_confirmed boolean not null default false,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, object_path),
  constraint media_assets_bucket_check check (bucket_id = 'mcello-media'),
  constraint media_assets_mime_check check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  constraint media_assets_size_check check (byte_size between 1 and 10485760),
  constraint media_assets_dimensions_check check (
    (width is null or width between 1 and 20000)
    and (height is null or height between 1 and 20000)
  ),
  constraint media_assets_alt_length_check check (length(alt_text) <= 250),
  constraint media_assets_source_check check (source_kind in ('owner_upload', 'user_supplied', 'licensed'))
);

create table public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete restrict,
  category text not null,
  title text,
  caption text,
  status public.content_status not null default 'draft',
  featured boolean not null default false,
  sort integer not null default 100,
  visible_from timestamptz,
  visible_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gallery_items_category_check check (category in ('food', 'venue', 'team', 'events')),
  constraint gallery_items_window_check check (
    visible_until is null or visible_from is null or visible_until > visible_from
  ),
  constraint gallery_items_title_length_check check (title is null or length(title) <= 160),
  constraint gallery_items_caption_length_check check (caption is null or length(caption) <= 1000)
);

create index media_assets_location_created_idx
  on public.media_assets (location_id, created_at desc);
create index media_assets_uploaded_by_idx
  on public.media_assets (uploaded_by)
  where uploaded_by is not null;
create index gallery_items_location_public_idx
  on public.gallery_items (location_id, featured desc, sort, created_at desc)
  where status = 'published';
create index gallery_items_media_id_idx on public.gallery_items (media_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'menu_products_image_media_id_fkey'
      and conrelid = 'public.menu_products'::regclass
  ) then
    alter table public.menu_products
      add constraint menu_products_image_media_id_fkey
      foreign key (image_media_id) references public.media_assets(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'editorial_posts_image_media_id_fkey'
      and conrelid = 'public.editorial_posts'::regclass
  ) then
    alter table public.editorial_posts
      add constraint editorial_posts_image_media_id_fkey
      foreign key (image_media_id) references public.media_assets(id) on delete set null;
  end if;
end $$;

create index if not exists menu_products_image_media_id_idx
  on public.menu_products (image_media_id) where image_media_id is not null;
create index if not exists editorial_posts_image_media_id_idx
  on public.editorial_posts (image_media_id) where image_media_id is not null;

create trigger touch_media_assets
before update on public.media_assets
for each row execute function public.touch_updated_at();

create trigger touch_gallery_items
before update on public.gallery_items
for each row execute function public.touch_updated_at();

alter table public.media_assets enable row level security;
alter table public.gallery_items enable row level security;

grant select on public.media_assets, public.gallery_items to authenticated;
grant all on public.media_assets, public.gallery_items to service_role;

create policy "gallery admins read media assets" on public.media_assets
for select to authenticated
using ((select public.has_role((select auth.uid()), 'admin')));

create policy "gallery admins read gallery items" on public.gallery_items
for select to authenticated
using ((select public.has_role((select auth.uid()), 'admin')));

-- A private bucket is prepared by scripts/bootstrap-local-staff.mjs through the
-- Storage API. Authenticated admins may only operate image objects below a
-- real location's <location-id>/gallery/ prefix.
create policy "mcello media admin insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'mcello-media'
  and (storage.foldername(name))[2] = 'gallery'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif')
  and exists (
    select 1 from public.locations l
    where l.id::text = (storage.foldername(name))[1]
  )
  and (select public.has_role((select auth.uid()), 'admin'))
);

create policy "mcello media admin select" on storage.objects
for select to authenticated
using (
  bucket_id = 'mcello-media'
  and (storage.foldername(name))[2] = 'gallery'
  and exists (
    select 1 from public.locations l
    where l.id::text = (storage.foldername(name))[1]
  )
  and (select public.has_role((select auth.uid()), 'admin'))
);

create policy "mcello media admin update" on storage.objects
for update to authenticated
using (
  bucket_id = 'mcello-media'
  and (storage.foldername(name))[2] = 'gallery'
  and exists (
    select 1 from public.locations l
    where l.id::text = (storage.foldername(name))[1]
  )
  and (select public.has_role((select auth.uid()), 'admin'))
)
with check (
  bucket_id = 'mcello-media'
  and (storage.foldername(name))[2] = 'gallery'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif')
  and exists (
    select 1 from public.locations l
    where l.id::text = (storage.foldername(name))[1]
  )
  and (select public.has_role((select auth.uid()), 'admin'))
);

create policy "mcello media admin delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'mcello-media'
  and (storage.foldername(name))[2] = 'gallery'
  and exists (
    select 1 from public.locations l
    where l.id::text = (storage.foldername(name))[1]
  )
  and (select public.has_role((select auth.uid()), 'admin'))
);

create or replace function public.admin_get_gallery(_location_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.require_admin();

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'category', g.category,
          'title', g.title,
          'caption', g.caption,
          'status', g.status,
          'featured', g.featured,
          'sort', g.sort,
          'visibleFrom', g.visible_from,
          'visibleUntil', g.visible_until,
          'createdAt', g.created_at,
          'updatedAt', g.updated_at,
          'media', jsonb_build_object(
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
          )
        ) order by g.featured desc, g.sort, g.created_at desc
      )
      from public.gallery_items g
      join public.media_assets m on m.id = g.media_id
      where g.location_id = _location_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_register_gallery_upload(
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
  _rights_confirmed boolean,
  _category text,
  _title text,
  _caption text,
  _status public.content_status,
  _featured boolean,
  _sort integer,
  _visible_from timestamptz,
  _visible_until timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset public.media_assets;
  item public.gallery_items;
  expected_prefix text := _location_id::text || '/gallery/';
begin
  perform public.require_admin();

  if _bucket_id <> 'mcello-media'
     or left(_object_path, length(expected_prefix)) <> expected_prefix
     or _object_path !~ '^[0-9a-f-]{36}/gallery/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|avif)$' then
    raise exception 'invalid gallery storage path' using errcode = 'check_violation';
  end if;
  if _mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
     or _byte_size not between 1 and 10485760 then
    raise exception 'invalid gallery image type or size' using errcode = 'check_violation';
  end if;
  if coalesce(trim(_original_filename), '') = '' or length(_original_filename) > 255 then
    raise exception 'original filename required' using errcode = 'check_violation';
  end if;
  if _category not in ('food', 'venue', 'team', 'events')
     or _source_kind not in ('owner_upload', 'user_supplied', 'licensed') then
    raise exception 'invalid gallery category or source' using errcode = 'check_violation';
  end if;
  if _visible_from is not null and _visible_until is not null and _visible_until <= _visible_from then
    raise exception 'publication end must be after publication start' using errcode = 'check_violation';
  end if;
  if _status = 'published'::public.content_status
     and (not coalesce(_rights_confirmed, false) or coalesce(trim(_alt_text), '') = '') then
    raise exception 'published media requires confirmed rights and alt text' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = _bucket_id and o.name = _object_path
  ) then
    raise exception 'uploaded storage object not found' using errcode = 'no_data_found';
  end if;

  insert into public.media_assets(
    location_id, bucket_id, object_path, original_filename, mime_type,
    byte_size, width, height, alt_text, source_kind, rights_confirmed, uploaded_by
  ) values (
    _location_id, _bucket_id, _object_path, trim(_original_filename), _mime_type,
    _byte_size, _width, _height, trim(coalesce(_alt_text, '')), _source_kind,
    coalesce(_rights_confirmed, false), (select auth.uid())
  ) returning * into asset;

  insert into public.gallery_items(
    location_id, media_id, category, title, caption, status, featured, sort,
    visible_from, visible_until
  ) values (
    _location_id, asset.id, _category, nullif(trim(_title), ''),
    nullif(trim(_caption), ''), _status, coalesce(_featured, false),
    coalesce(_sort, 100), _visible_from, _visible_until
  ) returning * into item;

  return jsonb_build_object('id', item.id, 'mediaId', asset.id);
end;
$$;

create or replace function public.admin_save_gallery_item(
  _id uuid,
  _location_id uuid,
  _category text,
  _title text,
  _caption text,
  _status public.content_status,
  _featured boolean,
  _sort integer,
  _visible_from timestamptz,
  _visible_until timestamptz,
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
  saved public.gallery_items;
  saved_media public.media_assets;
begin
  perform public.require_admin();

  if _category not in ('food', 'venue', 'team', 'events')
     or _source_kind not in ('owner_upload', 'user_supplied', 'licensed') then
    raise exception 'invalid gallery category or source' using errcode = 'check_violation';
  end if;
  if _visible_from is not null and _visible_until is not null and _visible_until <= _visible_from then
    raise exception 'publication end must be after publication start' using errcode = 'check_violation';
  end if;
  if _status = 'published'::public.content_status
     and (not coalesce(_rights_confirmed, false) or coalesce(trim(_alt_text), '') = '') then
    raise exception 'published media requires confirmed rights and alt text' using errcode = 'check_violation';
  end if;

  update public.gallery_items
  set category = _category,
      title = nullif(trim(_title), ''),
      caption = nullif(trim(_caption), ''),
      status = _status,
      featured = coalesce(_featured, false),
      sort = coalesce(_sort, 100),
      visible_from = _visible_from,
      visible_until = _visible_until
  where id = _id and location_id = _location_id
  returning * into saved;

  if saved.id is null then
    raise exception 'gallery item not found' using errcode = 'no_data_found';
  end if;

  update public.media_assets
  set alt_text = trim(coalesce(_alt_text, '')),
      source_kind = _source_kind,
      rights_confirmed = coalesce(_rights_confirmed, false)
  where id = saved.media_id and location_id = _location_id
  returning * into saved_media;

  return jsonb_build_object('id', saved.id, 'mediaId', saved_media.id);
end;
$$;

create or replace function public.admin_delete_gallery_item(
  _id uuid,
  _location_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.gallery_items;
  asset public.media_assets;
  delete_object boolean := false;
begin
  perform public.require_admin();

  select * into target
  from public.gallery_items
  where id = _id and location_id = _location_id
  for update;

  if target.id is null then
    raise exception 'gallery item not found' using errcode = 'no_data_found';
  end if;

  select * into asset from public.media_assets where id = target.media_id;
  delete from public.gallery_items where id = target.id;

  if not exists (select 1 from public.gallery_items g where g.media_id = asset.id)
     and not exists (select 1 from public.menu_products p where p.image_media_id = asset.id)
     and not exists (select 1 from public.editorial_posts p where p.image_media_id = asset.id) then
    delete from public.media_assets where id = asset.id;
    delete_object := true;
  end if;

  return jsonb_build_object(
    'deleted', true,
    'deleteObject', delete_object,
    'bucketId', asset.bucket_id,
    'objectPath', asset.object_path
  );
end;
$$;

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
    and exists (
      select 1 from public.gallery_items g
      where g.media_id = m.id
        and g.status = 'published'
        and (g.visible_from is null or g.visible_from <= now())
        and (g.visible_until is null or g.visible_until >= now())
    )
  limit 1
$$;

create or replace function public.get_public_content(
  _location_id uuid,
  _at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  configured boolean;
begin
  select exists (
    select 1 from public.homepage_sections s where s.location_id = _location_id
  ) into configured;

  return jsonb_build_object(
    'locationId', _location_id,
    'generatedAt', _at,
    'homepageConfigured', configured,
    'homepageSections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sectionKey', s.section_key,
          'sort', s.sort,
          'settings', s.settings
        ) order by s.sort, s.section_key
      )
      from public.homepage_sections s
      where s.location_id = _location_id and s.enabled
    ), '[]'::jsonb),
    'editorialPosts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'slug', p.slug,
          'kind', p.kind,
          'title', p.title,
          'teaser', p.teaser,
          'content', p.content,
          'imageMediaId', p.image_media_id,
          'pinned', p.pinned,
          'visibleFrom', p.visible_from,
          'visibleUntil', p.visible_until,
          'eventStartsAt', p.event_starts_at,
          'eventEndsAt', p.event_ends_at
        )
        order by p.pinned desc,
          coalesce(p.event_starts_at, p.visible_from, p.created_at) desc,
          p.created_at desc
      )
      from public.editorial_posts p
      where p.location_id = _location_id
        and p.status = 'published'
        and (p.visible_from is null or p.visible_from <= _at)
        and (p.visible_until is null or p.visible_until >= _at)
    ), '[]'::jsonb),
    'galleryItems', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'mediaId', m.id,
          'category', g.category,
          'title', g.title,
          'caption', g.caption,
          'altText', m.alt_text,
          'featured', g.featured
        ) order by g.featured desc, g.sort, g.created_at desc
      )
      from public.gallery_items g
      join public.media_assets m on m.id = g.media_id
      where g.location_id = _location_id
        and g.status = 'published'
        and m.rights_confirmed
        and trim(m.alt_text) <> ''
        and (g.visible_from is null or g.visible_from <= _at)
        and (g.visible_until is null or g.visible_until >= _at)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_get_gallery(uuid) from public, anon;
revoke all on function public.admin_register_gallery_upload(uuid,text,text,text,text,bigint,integer,integer,text,text,boolean,text,text,text,public.content_status,boolean,integer,timestamptz,timestamptz) from public, anon;
revoke all on function public.admin_save_gallery_item(uuid,uuid,text,text,text,public.content_status,boolean,integer,timestamptz,timestamptz,text,text,boolean) from public, anon;
revoke all on function public.admin_delete_gallery_item(uuid,uuid) from public, anon;
revoke all on function public.get_public_media_descriptor(uuid) from public, anon, authenticated;
revoke all on function public.get_public_content(uuid,timestamptz) from public;

grant execute on function public.admin_get_gallery(uuid) to authenticated;
grant execute on function public.admin_register_gallery_upload(uuid,text,text,text,text,bigint,integer,integer,text,text,boolean,text,text,text,public.content_status,boolean,integer,timestamptz,timestamptz) to authenticated;
grant execute on function public.admin_save_gallery_item(uuid,uuid,text,text,text,public.content_status,boolean,integer,timestamptz,timestamptz,text,text,boolean) to authenticated;
grant execute on function public.admin_delete_gallery_item(uuid,uuid) to authenticated;
grant execute on function public.get_public_media_descriptor(uuid) to service_role;
grant execute on function public.get_public_content(uuid,timestamptz) to anon, authenticated, service_role;

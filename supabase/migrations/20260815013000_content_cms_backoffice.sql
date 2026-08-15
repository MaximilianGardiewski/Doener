-- Mcello V1 editorial CMS and constrained homepage composition.
-- Media identifiers stay nullable until the private media/storage slice lands.

insert into public.homepage_sections (location_id, section_key, enabled, sort, settings)
select l.id, seed.section_key, true, seed.sort, '{}'::jsonb
from public.locations l
cross join (
  values
    ('hero', 10),
    ('quick_order', 20),
    ('story_team', 30),
    ('news_events', 40),
    ('gallery', 50),
    ('contact', 60)
) as seed(section_key, sort)
on conflict (location_id, section_key) do nothing;

create or replace function public.get_public_homepage(
  _location_id uuid,
  _at timestamptz default now()
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'locationId', _location_id,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', hs.id,
        'key', hs.section_key,
        'enabled', hs.enabled,
        'sort', hs.sort,
        'settings', hs.settings
      ) order by hs.sort, hs.section_key)
      from public.homepage_sections hs
      where hs.location_id = _location_id
        and hs.enabled
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ep.id,
        'slug', ep.slug,
        'kind', ep.kind,
        'title', ep.title,
        'teaser', ep.teaser,
        'content', ep.content,
        'imageMediaId', ep.image_media_id,
        'pinned', ep.pinned,
        'visibleFrom', ep.visible_from,
        'visibleUntil', ep.visible_until
      ) order by ep.pinned desc, coalesce(ep.visible_from, ep.created_at) desc, ep.created_at desc)
      from public.editorial_posts ep
      where ep.location_id = _location_id
        and ep.status = 'published'
        and (ep.visible_from is null or ep.visible_from <= _at)
        and (ep.visible_until is null or ep.visible_until >= _at)
    ), '[]'::jsonb)
  );
$$;

create or replace function public.admin_get_content(_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();

  if not exists (select 1 from public.locations where id = _location_id) then
    raise exception 'Unknown location';
  end if;

  return jsonb_build_object(
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', hs.id,
        'key', hs.section_key,
        'enabled', hs.enabled,
        'sort', hs.sort,
        'settings', hs.settings
      ) order by hs.sort, hs.section_key)
      from public.homepage_sections hs
      where hs.location_id = _location_id
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ep.id,
        'slug', ep.slug,
        'kind', ep.kind,
        'title', ep.title,
        'teaser', ep.teaser,
        'content', ep.content,
        'imageMediaId', ep.image_media_id,
        'status', ep.status,
        'pinned', ep.pinned,
        'visibleFrom', ep.visible_from,
        'visibleUntil', ep.visible_until,
        'createdAt', ep.created_at,
        'updatedAt', ep.updated_at
      ) order by ep.updated_at desc, ep.created_at desc)
      from public.editorial_posts ep
      where ep.location_id = _location_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_save_editorial_post(
  _id uuid,
  _location_id uuid,
  _slug text,
  _kind text,
  _title text,
  _teaser text,
  _content text,
  _status text,
  _pinned boolean,
  _visible_from timestamptz,
  _visible_until timestamptz
)
returns public.editorial_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.editorial_posts;
  normalized_slug text := lower(trim(coalesce(_slug, '')));
  normalized_title text := trim(coalesce(_title, ''));
begin
  perform public.require_admin();

  if not exists (select 1 from public.locations where id = _location_id) then
    raise exception 'Unknown location';
  end if;
  if normalized_slug = '' or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid editorial slug';
  end if;
  if length(normalized_slug) > 120 then
    raise exception 'Editorial slug is too long';
  end if;
  if normalized_title = '' or length(normalized_title) > 180 then
    raise exception 'Invalid editorial title';
  end if;
  if _kind not in ('news', 'event', 'special', 'press') then
    raise exception 'Invalid editorial kind';
  end if;
  if _status not in ('draft', 'published', 'archived') then
    raise exception 'Invalid editorial status';
  end if;
  if _visible_from is not null and _visible_until is not null and _visible_until < _visible_from then
    raise exception 'Visibility end must not precede start';
  end if;

  insert into public.editorial_posts (
    id, location_id, slug, kind, title, teaser, content, status, pinned,
    visible_from, visible_until
  ) values (
    coalesce(_id, gen_random_uuid()), _location_id, normalized_slug,
    _kind::public.editorial_kind, normalized_title, nullif(trim(coalesce(_teaser, '')), ''),
    nullif(trim(coalesce(_content, '')), ''), _status::public.content_status,
    coalesce(_pinned, false), _visible_from, _visible_until
  )
  on conflict (id) do update set
    slug = excluded.slug,
    kind = excluded.kind,
    title = excluded.title,
    teaser = excluded.teaser,
    content = excluded.content,
    status = excluded.status,
    pinned = excluded.pinned,
    visible_from = excluded.visible_from,
    visible_until = excluded.visible_until
  where editorial_posts.location_id = _location_id
  returning * into saved;

  if saved.id is null then
    raise exception 'Editorial post not found for location';
  end if;
  return saved;
end;
$$;

create or replace function public.admin_save_homepage_sections(
  _location_id uuid,
  _sections jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  section_item jsonb;
  section_key text;
  section_enabled boolean;
  section_sort integer;
  seen_keys text[] := '{}';
  allowed_keys constant text[] := array['hero', 'quick_order', 'story_team', 'news_events', 'gallery', 'contact'];
begin
  perform public.require_admin();

  if not exists (select 1 from public.locations where id = _location_id) then
    raise exception 'Unknown location';
  end if;
  if jsonb_typeof(_sections) <> 'array' or jsonb_array_length(_sections) <> cardinality(allowed_keys) then
    raise exception 'All controlled homepage sections are required';
  end if;

  for section_item in select value from jsonb_array_elements(_sections)
  loop
    section_key := section_item->>'key';
    if section_key is null or not (section_key = any(allowed_keys)) then
      raise exception 'Invalid homepage section key';
    end if;
    if section_key = any(seen_keys) then
      raise exception 'Duplicate homepage section key';
    end if;
    seen_keys := array_append(seen_keys, section_key);
    section_enabled := coalesce((section_item->>'enabled')::boolean, true);
    section_sort := coalesce((section_item->>'sort')::integer, 100);

    -- Brand/ordering entry points are V1 invariants and cannot be disabled.
    if section_key in ('hero', 'quick_order') then
      section_enabled := true;
    end if;

    insert into public.homepage_sections (location_id, section_key, enabled, sort, settings)
    values (_location_id, section_key, section_enabled, section_sort, '{}'::jsonb)
    on conflict (location_id, section_key) do update set
      enabled = excluded.enabled,
      sort = excluded.sort;
  end loop;

  return (select public.admin_get_content(_location_id)->'sections');
end;
$$;

revoke all on function public.get_public_homepage(uuid, timestamptz) from public;
revoke all on function public.admin_get_content(uuid) from public, anon;
revoke all on function public.admin_save_editorial_post(uuid, uuid, text, text, text, text, text, text, boolean, timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_save_homepage_sections(uuid, jsonb) from public, anon;

grant execute on function public.get_public_homepage(uuid, timestamptz) to anon, authenticated, service_role;
grant execute on function public.admin_get_content(uuid) to authenticated, service_role;
grant execute on function public.admin_save_editorial_post(uuid, uuid, text, text, text, text, text, text, boolean, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.admin_save_homepage_sections(uuid, jsonb) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'editorial_posts'
  ) then
    alter publication supabase_realtime add table public.editorial_posts;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'homepage_sections'
  ) then
    alter publication supabase_realtime add table public.homepage_sections;
  end if;
end $$;

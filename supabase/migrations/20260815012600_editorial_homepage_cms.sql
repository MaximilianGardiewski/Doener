-- Editorial + homepage CMS slice.
-- Publication windows and event occurrence times are intentionally separate:
-- a Saturday event may be promoted days before it occurs.

alter table public.editorial_posts
  add column if not exists event_starts_at timestamptz,
  add column if not exists event_ends_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'editorial_posts_visible_window_check'
      and conrelid = 'public.editorial_posts'::regclass
  ) then
    alter table public.editorial_posts
      add constraint editorial_posts_visible_window_check
      check (visible_until is null or visible_from is null or visible_until > visible_from);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'editorial_posts_event_window_check'
      and conrelid = 'public.editorial_posts'::regclass
  ) then
    alter table public.editorial_posts
      add constraint editorial_posts_event_window_check
      check (event_ends_at is null or event_starts_at is null or event_ends_at > event_starts_at);
  end if;
end $$;

create or replace function public.get_public_content(
  _location_id uuid,
  _at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
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
      where s.location_id = _location_id
        and s.enabled
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
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_get_content(_location_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();

  return jsonb_build_object(
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
          'status', p.status,
          'pinned', p.pinned,
          'visibleFrom', p.visible_from,
          'visibleUntil', p.visible_until,
          'eventStartsAt', p.event_starts_at,
          'eventEndsAt', p.event_ends_at,
          'createdAt', p.created_at,
          'updatedAt', p.updated_at
        ) order by p.updated_at desc, p.created_at desc
      )
      from public.editorial_posts p
      where p.location_id = _location_id
    ), '[]'::jsonb),
    'homepageSections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'sectionKey', s.section_key,
          'enabled', s.enabled,
          'sort', s.sort,
          'settings', s.settings
        ) order by s.sort, s.section_key
      )
      from public.homepage_sections s
      where s.location_id = _location_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_save_editorial_post(
  _id uuid,
  _location_id uuid,
  _slug text,
  _kind public.editorial_kind,
  _title text,
  _teaser text,
  _content text,
  _status public.content_status,
  _pinned boolean,
  _visible_from timestamptz,
  _visible_until timestamptz,
  _event_starts_at timestamptz,
  _event_ends_at timestamptz
)
returns public.editorial_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  saved public.editorial_posts;
begin
  perform public.require_admin();

  if coalesce(trim(_slug), '') = '' or coalesce(trim(_title), '') = '' then
    raise exception 'editorial slug and title are required' using errcode = 'check_violation';
  end if;
  if _visible_from is not null and _visible_until is not null and _visible_until <= _visible_from then
    raise exception 'publication end must be after publication start' using errcode = 'check_violation';
  end if;
  if _event_starts_at is not null and _event_ends_at is not null and _event_ends_at <= _event_starts_at then
    raise exception 'event end must be after event start' using errcode = 'check_violation';
  end if;
  if _status = 'published'::public.content_status
     and _kind = 'event'::public.editorial_kind
     and _event_starts_at is null then
    raise exception 'published events require an event start' using errcode = 'check_violation';
  end if;

  if _id is null then
    insert into public.editorial_posts(
      location_id, slug, kind, title, teaser, content, status, pinned,
      visible_from, visible_until, event_starts_at, event_ends_at
    ) values (
      _location_id, trim(_slug), _kind, trim(_title), nullif(trim(_teaser), ''),
      nullif(trim(_content), ''), _status, coalesce(_pinned, false),
      _visible_from, _visible_until, _event_starts_at, _event_ends_at
    ) returning * into saved;
  else
    update public.editorial_posts
    set slug = trim(_slug),
        kind = _kind,
        title = trim(_title),
        teaser = nullif(trim(_teaser), ''),
        content = nullif(trim(_content), ''),
        status = _status,
        pinned = coalesce(_pinned, false),
        visible_from = _visible_from,
        visible_until = _visible_until,
        event_starts_at = _event_starts_at,
        event_ends_at = _event_ends_at
    where id = _id and location_id = _location_id
    returning * into saved;
  end if;

  if saved.id is null then
    raise exception 'editorial post not found' using errcode = 'no_data_found';
  end if;
  return saved;
end;
$$;

create or replace function public.admin_delete_editorial_post(
  _id uuid,
  _location_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  perform public.require_admin();
  delete from public.editorial_posts where id = _id and location_id = _location_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.admin_replace_homepage_sections(
  _location_id uuid,
  _rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_value jsonb;
  section_key_value text;
  settings_value jsonb;
begin
  perform public.require_admin();

  if _rows is null or jsonb_typeof(_rows) <> 'array' then
    raise exception 'homepage sections must be an array' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(_rows) > 50 then
    raise exception 'too many homepage sections' using errcode = 'check_violation';
  end if;

  for row_value in select value from jsonb_array_elements(_rows)
  loop
    section_key_value := trim(coalesce(row_value->>'sectionKey', ''));
    settings_value := coalesce(row_value->'settings', '{}'::jsonb);
    if section_key_value = '' or length(section_key_value) > 80 then
      raise exception 'valid homepage section key required' using errcode = 'check_violation';
    end if;
    if jsonb_typeof(settings_value) <> 'object' then
      raise exception 'homepage section settings must be an object' using errcode = 'check_violation';
    end if;
  end loop;

  delete from public.homepage_sections where location_id = _location_id;

  insert into public.homepage_sections(location_id, section_key, enabled, sort, settings)
  select
    _location_id,
    trim(value->>'sectionKey'),
    coalesce((value->>'enabled')::boolean, true),
    coalesce((value->>'sort')::integer, 100),
    coalesce(value->'settings', '{}'::jsonb)
  from jsonb_array_elements(_rows);

  return jsonb_build_object(
    'rows', (select count(*) from public.homepage_sections where location_id = _location_id)
  );
end;
$$;

revoke all on function public.get_public_content(uuid,timestamptz) from public;
revoke all on function public.admin_get_content(uuid) from public, anon;
revoke all on function public.admin_save_editorial_post(uuid,uuid,text,public.editorial_kind,text,text,text,public.content_status,boolean,timestamptz,timestamptz,timestamptz,timestamptz) from public, anon;
revoke all on function public.admin_delete_editorial_post(uuid,uuid) from public, anon;
revoke all on function public.admin_replace_homepage_sections(uuid,jsonb) from public, anon;

grant execute on function public.get_public_content(uuid,timestamptz) to anon, authenticated, service_role;
grant execute on function public.admin_get_content(uuid) to authenticated;
grant execute on function public.admin_save_editorial_post(uuid,uuid,text,public.editorial_kind,text,text,text,public.content_status,boolean,timestamptz,timestamptz,timestamptz,timestamptz) to authenticated;
grant execute on function public.admin_delete_editorial_post(uuid,uuid) to authenticated;
grant execute on function public.admin_replace_homepage_sections(uuid,jsonb) to authenticated;

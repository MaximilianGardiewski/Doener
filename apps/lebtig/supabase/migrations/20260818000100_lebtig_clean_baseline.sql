-- Lebtig clean-install baseline.
-- Derived from the effective end state of the verified donor migrations.
-- Deliberately contains no business/contact/menu/news/recipe seed data.

create type public.app_role as enum ('admin', 'moderator');

create table public.profiles (
  id uuid primary key,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('admin'::public.app_role, 'moderator'::public.app_role)
  )
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  -- Exactly one first account may win bootstrap admin, including concurrent signups.
  perform pg_advisory_xact_lock(hashtext('public.user_roles:bootstrap_admin'));

  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;

  -- After bootstrap, accounts intentionally receive no editorial role automatically.
  return new;
end;
$$;

create or replace function public.is_bootstrap_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.user_roles)
$$;

create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_count integer;
begin
  if old.role <> 'admin'::public.app_role then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE'
    and new.role = 'admin'::public.app_role
    and new.user_id = old.user_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.user_roles:last_admin'));

  select count(*) into admin_count
  from public.user_roles
  where role = 'admin'::public.app_role;

  if admin_count <= 1 then
    raise exception 'Die letzte Administrator-Rolle kann nicht entfernt oder geändert werden.'
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.has_role(uuid, public.app_role) from public, anon;
revoke all on function public.is_staff() from public, anon;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke all on function public.protect_last_admin() from public, anon, authenticated, service_role;
revoke all on function public.touch_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.is_bootstrap_open() from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_staff() to authenticated;
-- Bootstrap state is a server-side capability, never an anonymous browser RPC.
grant execute on function public.is_bootstrap_open() to service_role;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger t_user_roles_protect_last_admin
  before update or delete on public.user_roles
  for each row execute function public.protect_last_admin();

-- Profiles and roles ---------------------------------------------------------
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create policy profiles_read_staff_or_self
  on public.profiles for select to authenticated
  using (public.is_staff() or id = auth.uid());
create policy profiles_insert_self
  on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create policy user_roles_read_self_or_admin
  on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy user_roles_admin_manage
  on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Site settings --------------------------------------------------------------
create table public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;
grant all on public.site_settings to service_role;
alter table public.site_settings enable row level security;

create policy site_settings_public_read
  on public.site_settings for select to anon, authenticated using (true);
create policy site_settings_admin_manage
  on public.site_settings for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create trigger t_site_settings_updated
  before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- Media metadata + private storage ------------------------------------------
create table public.media (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  storage_path text unique,
  alt text not null check (char_length(btrim(alt)) between 1 and 180),
  title text,
  caption text,
  focal_x numeric not null default 50 check (focal_x between 0 and 100),
  focal_y numeric not null default 50 check (focal_y between 0 and 100),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.media to authenticated;
grant all on public.media to service_role;
alter table public.media enable row level security;

-- Metadata and object storage stay editorial/private. Public delivery is the
-- app-owned /media/:id server boundary, which can resolve only approved usage.
create policy media_staff_read
  on public.media for select to authenticated using (public.is_staff());
create policy media_staff_manage
  on public.media for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

create trigger t_media_updated
  before update on public.media
  for each row execute function public.touch_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy lebtig_media_objects_staff_read
  on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_staff());
create policy lebtig_media_objects_staff_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_staff());
create policy lebtig_media_objects_staff_update
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_staff())
  with check (bucket_id = 'media' and public.is_staff());
create policy lebtig_media_objects_staff_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_staff());

-- CMS -----------------------------------------------------------------------
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  seo_title text,
  seo_description text,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'archived')),
  show_in_nav boolean not null default false,
  nav_order integer not null default 100,
  parent_id uuid references public.pages(id) on delete set null,
  blocks jsonb not null default '[]'::jsonb,
  publish_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.lunch_weeks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  week_end date not null,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'archived')),
  publish_at timestamptz,
  note text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (week_end >= week_start)
);

create table public.lunch_items (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.lunch_weeks(id) on delete cascade,
  weekday integer not null check (weekday between 1 and 5),
  dish text not null default '',
  description text,
  price numeric(10,2) check (price is null or price >= 0),
  allergens text,
  image_url text,
  sort integer not null default 0,
  unique (week_id, weekday)
);

create table public.offer_weeks (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  week_end date not null,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'archived')),
  publish_at timestamptz,
  title text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (week_end >= week_start)
);

create table public.offer_items (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.offer_weeks(id) on delete cascade,
  product text not null default '',
  unit text,
  price numeric(10,2) check (price is null or price >= 0),
  old_price numeric(10,2) check (old_price is null or old_price >= 0),
  highlight boolean not null default false,
  image_url text,
  sort integer not null default 0
);

create table public.news (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  teaser text,
  content text,
  image_url text,
  tags text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'archived')),
  publish_at timestamptz,
  start_at timestamptz,
  end_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (end_at is null or start_at is null or end_at >= start_at)
);

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  image_url text,
  servings text,
  intro text,
  ingredients jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  tips text,
  seo_description text,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'archived')),
  publish_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.party_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  event_type text,
  guests integer check (guests is null or guests > 0),
  event_date date,
  event_time text,
  message text,
  status text not null default 'neu',
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pages: public readers see published content; only admins change structure.
grant select on public.pages to anon, authenticated;
grant insert, update, delete on public.pages to authenticated;
grant all on public.pages to service_role;
alter table public.pages enable row level security;
create policy pages_public_read
  on public.pages for select to anon, authenticated
  using (status = 'published' and (publish_at is null or publish_at <= now()));
create policy pages_staff_read
  on public.pages for select to authenticated using (public.is_staff());
create policy pages_admin_manage
  on public.pages for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
create trigger t_pages_updated
  before update on public.pages
  for each row execute function public.touch_updated_at();

-- Editorial roots: moderators and admins manage; public reads published data.
do $$
declare
  t text;
begin
  foreach t in array array['lunch_weeks', 'offer_weeks', 'news', 'recipes'] loop
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (status = ''published'' and (publish_at is null or publish_at <= now()))',
      t || '_public_read', t
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_staff())',
      t || '_staff_read', t
    );
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())',
      t || '_staff_manage', t
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      't_' || t || '_updated', t
    );
  end loop;
end
$$;

-- News additionally respects its visibility window at the DB/public boundary.
drop policy news_public_read on public.news;
create policy news_public_read
  on public.news for select to anon, authenticated
  using (
    status = 'published'
    and (publish_at is null or publish_at <= now())
    and (start_at is null or start_at <= now())
    and (end_at is null or end_at >= now())
  );

-- Child rows are public only through a currently published parent week.
foreach_child: do $$
begin
  grant select on public.lunch_items to anon, authenticated;
  grant insert, update, delete on public.lunch_items to authenticated;
  grant all on public.lunch_items to service_role;
  alter table public.lunch_items enable row level security;

  grant select on public.offer_items to anon, authenticated;
  grant insert, update, delete on public.offer_items to authenticated;
  grant all on public.offer_items to service_role;
  alter table public.offer_items enable row level security;
end
$$;

create policy lunch_items_public_read
  on public.lunch_items for select to anon, authenticated
  using (
    exists (
      select 1 from public.lunch_weeks w
      where w.id = lunch_items.week_id
        and w.status = 'published'
        and (w.publish_at is null or w.publish_at <= now())
    )
  );
create policy lunch_items_staff_read
  on public.lunch_items for select to authenticated using (public.is_staff());
create policy lunch_items_staff_manage
  on public.lunch_items for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy offer_items_public_read
  on public.offer_items for select to anon, authenticated
  using (
    exists (
      select 1 from public.offer_weeks w
      where w.id = offer_items.week_id
        and w.status = 'published'
        and (w.publish_at is null or w.publish_at <= now())
    )
  );
create policy offer_items_staff_read
  on public.offer_items for select to authenticated using (public.is_staff());
create policy offer_items_staff_manage
  on public.offer_items for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Party requests: anyone may submit, staff operate, only admin may delete.
grant insert on public.party_requests to anon;
grant select, insert, update, delete on public.party_requests to authenticated;
grant all on public.party_requests to service_role;
alter table public.party_requests enable row level security;
create policy party_requests_submit
  on public.party_requests for insert to anon, authenticated with check (true);
create policy party_requests_staff_read
  on public.party_requests for select to authenticated using (public.is_staff());
create policy party_requests_staff_update
  on public.party_requests for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy party_requests_admin_delete
  on public.party_requests for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));
create trigger t_party_requests_updated
  before update on public.party_requests
  for each row execute function public.touch_updated_at();

-- Useful read-path indexes.
create index pages_status_publish_idx on public.pages(status, publish_at);
create index lunch_weeks_status_publish_idx on public.lunch_weeks(status, publish_at);
create index lunch_items_week_idx on public.lunch_items(week_id);
create index offer_weeks_status_publish_idx on public.offer_weeks(status, publish_at);
create index offer_items_week_idx on public.offer_items(week_id);
create index news_status_window_idx on public.news(status, publish_at, start_at, end_at);
create index recipes_status_publish_idx on public.recipes(status, publish_at);
create index party_requests_created_idx on public.party_requests(created_at desc);

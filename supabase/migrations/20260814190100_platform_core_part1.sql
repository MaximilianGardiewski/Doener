-- BusinessWebFactory platform core / Mcello slice 0
-- Provider-neutral domain; Supabase/Postgres is the first persistence adapter.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'staff');
create type public.content_status as enum ('draft', 'published', 'archived');
create type public.order_state as enum (
  'waiting_for_acceptance',
  'scheduled',
  'preparing',
  'ready',
  'completed',
  'rejected',
  'cancelled'
);
create type public.fulfillment_type as enum ('pickup', 'delivery');
create type public.order_source as enum ('web', 'counter', 'table');
create type public.shop_override as enum ('auto', 'force_open', 'force_closed', 'pause', 'today_closed');
create type public.editorial_kind as enum ('news', 'event', 'special', 'press');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role in ('admin'::public.app_role, 'staff'::public.app_role)
  )
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
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
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  -- Only exactly one concurrent first account may win bootstrap admin.
  perform pg_advisory_xact_lock(hashtext('business_web_factory:user_roles:bootstrap_admin'));

  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_bootstrap_open()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.user_roles)
$$;

create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count integer;
begin
  if old.role <> 'admin' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and new.role = 'admin' and new.user_id = old.user_id then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('business_web_factory:user_roles:last_admin'));

  select count(*) into admin_count
  from public.user_roles
  where role = 'admin';

  if admin_count <= 1 then
    raise exception 'The last administrator role cannot be removed or changed.'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger user_roles_protect_last_admin
before update or delete on public.user_roles
for each row execute function public.protect_last_admin();

-- Business/location boundary: Mcello has one visible location, platform core keeps the boundary.
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  timezone text not null default 'Europe/Berlin',
  street text,
  postal_code text,
  city text,
  phone text,
  whatsapp text,
  maps_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opening_hours (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  opens_at time,
  closes_at time,
  closed boolean not null default false,
  sort smallint not null default 0,
  unique (location_id, weekday, opens_at, closes_at)
);

create table public.special_opening_hours (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  day date not null,
  opens_at time,
  closes_at time,
  closed boolean not null default false,
  public_note text,
  unique (location_id, day, opens_at, closes_at)
);

create table public.ordering_settings (
  location_id uuid primary key references public.locations(id) on delete cascade,
  override public.shop_override not null default 'auto',
  operator_message text,
  order_cutoff_minutes integer not null default 30 check (order_cutoff_minutes between 0 and 240),
  acceptance_timeout_minutes integer not null default 5 check (acceptance_timeout_minutes between 1 and 60),
  slot_minutes integer not null default 15 check (slot_minutes between 5 and 120),
  slot_capacity integer not null default 6 check (slot_capacity > 0),
  preparation_lead_minutes integer not null default 25 check (preparation_lead_minutes between 0 and 240),
  online_ordering_enabled boolean not null default true,
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Menu
create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  sort integer not null default 100,
  status public.content_status not null default 'draft',
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, slug)
);

create table public.menu_products (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  category_id uuid not null references public.menu_categories(id) on delete restrict,
  slug text not null,
  name text not null,
  description text,
  base_price_cents integer not null check (base_price_cents >= 0),
  image_media_id uuid,
  status public.content_status not null default 'draft',
  bestseller boolean not null default false,
  orderable_online boolean not null default true,
  dietary_tags text[] not null default '{}',
  effort_weight numeric(8,2),
  owner_confirmed boolean not null default false,
  source_note text,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, slug)
);

create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null,
  min_selections integer not null default 0 check (min_selections >= 0),
  max_selections integer not null default 1 check (max_selections >= min_selections),
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.modifier_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.modifier_groups(id) on delete cascade,
  name text not null,
  price_delta_cents integer not null default 0,
  default_selected boolean not null default false,
  active boolean not null default true,
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_modifier_groups (
  product_id uuid not null references public.menu_products(id) on delete cascade,
  group_id uuid not null references public.modifier_groups(id) on delete cascade,
  sort integer not null default 100,
  primary key (product_id, group_id)
);

create table public.allergens (
  id uuid primary key default gen_random_uuid(),
  code text,
  name text not null unique
);

create table public.product_allergens (
  product_id uuid not null references public.menu_products(id) on delete cascade,
  allergen_id uuid not null references public.allergens(id) on delete cascade,
  primary key (product_id, allergen_id)
);

create table public.modifier_option_allergens (
  option_id uuid not null references public.modifier_options(id) on delete cascade,
  allergen_id uuid not null references public.allergens(id) on delete cascade,
  primary key (option_id, allergen_id)
);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  product_id uuid references public.menu_products(id) on delete cascade,
  category_id uuid references public.menu_categories(id) on delete cascade,
  weekday smallint check (weekday between 1 and 7),
  starts_at time,
  ends_at time,
  valid_from date,
  valid_until date,
  enabled boolean not null default true,
  check ((product_id is not null) <> (category_id is not null))
);

create table public.snoozes (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  product_id uuid references public.menu_products(id) on delete cascade,
  modifier_option_id uuid references public.modifier_options(id) on delete cascade,
  until_at timestamptz not null,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((product_id is not null) <> (modifier_option_id is not null))
);

create table public.product_cross_sells (
  product_id uuid not null references public.menu_products(id) on delete cascade,
  suggested_product_id uuid not null references public.menu_products(id) on delete cascade,
  sort integer not null default 100,
  primary key (product_id, suggested_product_id),
  check (product_id <> suggested_product_id)
);

-- Orders are written/read through server APIs after OTP verification.
-- Anonymous clients get no direct table access.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null default gen_random_uuid() unique,
  order_number bigint generated always as identity unique,
  location_id uuid not null references public.locations(id) on delete restrict,
  source public.order_source not null default 'web',
  fulfillment public.fulfillment_type not null default 'pickup',
  state public.order_state not null default 'waiting_for_acceptance',
  customer_first_name text not null,
  mobile text not null,
  comment text,
  requested_pickup_at timestamptz,
  accepted_pickup_at timestamptz,
  total_cents integer not null check (total_cents >= 0),
  submitted_at timestamptz not null default now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.menu_products(id) on delete set null,
  product_name_snapshot text not null,
  base_price_cents_snapshot integer not null,
  quantity integer not null default 1 check (quantity > 0),
  comment text,
  sort integer not null default 0
);

create table public.order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  group_name_snapshot text not null,
  option_name_snapshot text not null,
  price_delta_cents_snapshot integer not null default 0
);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Editorial/community CMS
create table public.editorial_posts (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  slug text not null,
  kind public.editorial_kind not null,
  title text not null,
  teaser text,
  content text,
  image_media_id uuid,
  status public.content_status not null default 'draft',
  pinned boolean not null default false,
  visible_from timestamptz,
  visible_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, slug)
);

create table public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  section_key text not null,
  enabled boolean not null default true,
  sort integer not null default 100,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (location_id, section_key)
);

-- Generic updated_at triggers
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'locations',
    'ordering_settings',
    'menu_categories',
    'menu_products',
    'modifier_groups',
    'modifier_options',
    'orders',
    'editorial_posts',
    'homepage_sections'
  ] loop
    execute format(
      'create trigger touch_%1$s before update on public.%1$I for each row execute function public.touch_updated_at()',
      table_name
    );
  end loop;
end $$;

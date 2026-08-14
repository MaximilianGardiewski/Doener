-- Supabase component compatibility for authenticated identity inside RLS.
--
-- PostgREST-backed requests expose the subject through request.jwt.claim.sub.
-- Realtime postgres_changes RLS evaluation in Realtime v2.124.x sets the
-- complete JWT JSON in request.jwt.claims. Keep our authorization layer
-- provider/version tolerant without modifying functions in the auth schema.

create or replace function public.current_user_id()
returns uuid
language sql
stable
set search_path = public, pg_catalog
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    nullif(
      coalesce(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
        ''
      ),
      ''
    )::uuid
  )
$$;

revoke all on function public.current_user_id() from public, anon;
grant execute on function public.current_user_id() to authenticated;

-- Staff authorization is used directly by Realtime-aware RLS policies.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = public.current_user_id()
      and role in ('admin'::public.app_role, 'staff'::public.app_role)
  )
$$;

-- Admin checks in RPCs must use the same identity source as RLS.
create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_role(public.current_user_id(), 'admin') then
    raise exception 'admin role required' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

-- Identity-sensitive profile/role policies.
drop policy if exists "profile own insert" on public.profiles;
create policy "profile own insert" on public.profiles
for insert to authenticated
with check (id = public.current_user_id());

drop policy if exists "profile own update" on public.profiles;
create policy "profile own update" on public.profiles
for update to authenticated
using (id = public.current_user_id())
with check (id = public.current_user_id());

drop policy if exists "profile own or admin read" on public.profiles;
create policy "profile own or admin read" on public.profiles
for select to authenticated
using (
  id = public.current_user_id()
  or public.has_role(public.current_user_id(), 'admin')
);

drop policy if exists "roles own or admin read" on public.user_roles;
create policy "roles own or admin read" on public.user_roles
for select to authenticated
using (
  user_id = public.current_user_id()
  or public.has_role(public.current_user_id(), 'admin')
);

drop policy if exists "admins manage roles" on public.user_roles;
create policy "admins manage roles" on public.user_roles
for all to authenticated
using (public.has_role(public.current_user_id(), 'admin'))
with check (public.has_role(public.current_user_id(), 'admin'));

-- Recreate structural admin policies with the compatibility identity helper.
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
    execute format('drop policy if exists "admin manage %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "admin manage %1$s" on public.%1$I for all to authenticated using (public.has_role(public.current_user_id(), ''admin'')) with check (public.has_role(public.current_user_id(), ''admin''))',
      table_name
    );
  end loop;
end $$;

-- Ordering settings are also part of the Realtime publication.
drop policy if exists "admins manage ordering settings" on public.ordering_settings;
create policy "admins manage ordering settings" on public.ordering_settings
for all to authenticated
using (public.has_role(public.current_user_id(), 'admin'))
with check (public.has_role(public.current_user_id(), 'admin'));

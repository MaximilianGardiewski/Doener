-- Development-only fixtures. These rows are not claims about the real Mcello menu.
-- They exist only to make the local checkout/KDS/status vertical slice reproducible.

insert into public.locations (
  id, slug, name, timezone, active
) values (
  '00000000-0000-4000-8000-000000000001',
  'mcello',
  'Mcello',
  'Europe/Berlin',
  true
) on conflict (id) do nothing;

insert into public.ordering_settings (
  location_id,
  override,
  order_cutoff_minutes,
  acceptance_timeout_minutes,
  slot_minutes,
  slot_capacity,
  preparation_lead_minutes,
  online_ordering_enabled,
  pickup_enabled,
  delivery_enabled
) values (
  '00000000-0000-4000-8000-000000000001',
  'force_open',
  30,
  5,
  15,
  6,
  25,
  true,
  true,
  false
) on conflict (location_id) do nothing;

insert into public.menu_categories (
  id, location_id, slug, name, sort, status, visible
) values (
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000001',
  'dev-test',
  'DEV Testkategorie',
  1,
  'published',
  true
) on conflict (id) do nothing;

insert into public.menu_products (
  id,
  location_id,
  category_id,
  slug,
  name,
  description,
  base_price_cents,
  status,
  orderable_online,
  owner_confirmed,
  source_note,
  sort
) values (
  '00000000-0000-4000-8000-000000000100',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000010',
  'dev-konfigurator-test',
  'DEV – Konfigurierbares Testgericht',
  'Lokaler Entwicklungsdatensatz, kein öffentlich bestätigtes Mcello-Angebot.',
  800,
  'published',
  true,
  false,
  'Development fixture only',
  1
) on conflict (id) do nothing;

insert into public.modifier_groups (
  id, location_id, name, min_selections, max_selections, sort
) values (
  '00000000-0000-4000-8000-000000000200',
  '00000000-0000-4000-8000-000000000001',
  'DEV Sauce',
  1,
  1,
  1
) on conflict (id) do nothing;

insert into public.modifier_options (
  id, group_id, name, price_delta_cents, default_selected, active, sort
) values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000200',
    'DEV Mild',
    0,
    true,
    true,
    1
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000200',
    'DEV Extra',
    100,
    false,
    true,
    2
  )
on conflict (id) do nothing;

insert into public.product_modifier_groups (product_id, group_id, sort)
values (
  '00000000-0000-4000-8000-000000000100',
  '00000000-0000-4000-8000-000000000200',
  1
) on conflict do nothing;

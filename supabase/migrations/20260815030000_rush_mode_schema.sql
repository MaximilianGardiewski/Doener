-- D012: Rush is an operational mode distinct from pause. It keeps online
-- ordering open while adding an admin-configured buffer to ASAP KDS promises.
-- Keep enum introduction separate from functions that use the new value so the
-- migration remains safe under PostgreSQL transactional enum rules.

alter type public.shop_override add value if not exists 'rush';

alter table public.ordering_settings
  add column if not exists rush_extra_minutes integer not null default 10;

alter table public.ordering_settings
  drop constraint if exists ordering_settings_rush_extra_minutes_check;

alter table public.ordering_settings
  add constraint ordering_settings_rush_extra_minutes_check
  check (rush_extra_minutes between 5 and 60);

comment on column public.ordering_settings.rush_extra_minutes is
  'Additional server-authoritative minutes added to ASAP KDS acceptance presets while shop_override=rush. Preorder slots are never shifted.';

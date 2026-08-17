-- Tighten ordering-settings access after introducing narrow operational RPCs.
-- Staff/admin clients may read the row for Realtime/UI state, but structural writes
-- must go through SECURITY DEFINER RPCs that enforce the intended role boundary.

revoke insert, update, delete on public.ordering_settings from authenticated;

drop policy if exists "staff manage ordering settings" on public.ordering_settings;
drop policy if exists "staff read ordering settings" on public.ordering_settings;

create policy "staff read ordering settings" on public.ordering_settings
for select to authenticated
using (public.is_staff());

-- SECURITY DEFINER functions remain the only authenticated mutation paths:
--   admin_save_ordering_settings(...) -> structural configuration, admin only
--   staff_set_shop_override(...)      -> auto/close/pause/today_closed, staff/admin

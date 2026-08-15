-- Tighten the operational/structural boundary for ordering settings.
-- Staff may read the current settings and use the narrow staff_set_shop_override RPC,
-- but may not PATCH capacity, cutoff or other structural fields directly.

drop policy if exists "staff manage ordering settings" on public.ordering_settings;

revoke insert, update, delete on public.ordering_settings from authenticated;
grant select on public.ordering_settings to authenticated;

create policy "staff read ordering settings" on public.ordering_settings
for select to authenticated
using (public.is_staff());

-- Structural writes continue through SECURITY DEFINER admin_save_ordering_settings().
-- Operational override writes continue through SECURITY DEFINER staff_set_shop_override().

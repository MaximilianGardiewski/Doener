create or replace function public.admin_set_shop_override(
  _location_id uuid,
  _override public.shop_override,
  _operator_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _message text := nullif(btrim(coalesce(_operator_message, '')), '');
  _result jsonb;
begin
  perform public.require_admin(_location_id);

  if _override is null then
    raise exception 'Shop override is required';
  end if;

  if _message is not null and char_length(_message) > 180 then
    raise exception 'Operator message may not exceed 180 characters';
  end if;

  update public.ordering_settings
  set override = _override,
      operator_message = _message,
      updated_at = now()
  where location_id = _location_id;

  if not found then
    raise exception 'Ordering settings not found for location';
  end if;

  select jsonb_build_object(
    'override', settings.override,
    'operatorMessage', settings.operator_message,
    'updatedAt', settings.updated_at
  )
  into _result
  from public.ordering_settings settings
  where settings.location_id = _location_id;

  return _result;
end;
$$;

revoke all on function public.admin_set_shop_override(uuid, public.shop_override, text) from public, anon;
grant execute on function public.admin_set_shop_override(uuid, public.shop_override, text) to authenticated;

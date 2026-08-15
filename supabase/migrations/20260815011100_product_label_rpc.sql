-- Focused atomic edit path for the dedicated labels/allergen workspace.

create or replace function public.admin_set_product_labels(
  _product_id uuid,
  _dietary_tags text[],
  _allergen_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_tags text[];
  allergen_ids uuid[];
begin
  perform public.require_admin();

  if not exists (select 1 from public.menu_products p where p.id = _product_id) then
    raise exception 'product not found' using errcode = 'no_data_found';
  end if;

  normalized_tags := public.admin_normalize_dietary_tags(_dietary_tags);
  allergen_ids := public.admin_validate_allergen_ids(_allergen_ids);

  update public.menu_products
  set dietary_tags = normalized_tags
  where id = _product_id;

  perform public.admin_set_product_allergens(_product_id, allergen_ids);

  return jsonb_build_object(
    'productId', _product_id,
    'dietaryTags', to_jsonb(normalized_tags),
    'allergenIds', to_jsonb(allergen_ids)
  );
end;
$$;

revoke all on function public.admin_set_product_labels(uuid,text[],uuid[]) from public, anon;
grant execute on function public.admin_set_product_labels(uuid,text[],uuid[]) to authenticated;

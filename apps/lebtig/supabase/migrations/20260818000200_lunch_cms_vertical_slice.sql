-- Lebtig Mittagstisch CMS vertical slice.
-- Adds transactional create/save/copy operations and DB-side publication guards.

create or replace function public.guard_lunch_week_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_count integer;
  blank_count integer;
begin
  if new.week_end < new.week_start then
    raise exception 'Das Ende der Mittagstischwoche darf nicht vor dem Start liegen.'
      using errcode = 'check_violation';
  end if;

  if new.status = 'published' then
    select
      count(*),
      count(*) filter (where char_length(btrim(i.dish)) = 0)
    into item_count, blank_count
    from public.lunch_items i
    where i.week_id = new.id;

    if item_count <> 5 then
      raise exception 'Vor der Veröffentlichung müssen Montag bis Freitag vollständig vorhanden sein.'
        using errcode = 'check_violation';
    end if;

    if blank_count > 0 then
      raise exception 'Vor der Veröffentlichung benötigt jeder Wochentag ein Gericht.'
        using errcode = 'check_violation';
    end if;

    if tg_op = 'INSERT' or old.status <> 'published' or new.publish_at is null then
      new.publish_at = now();
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_published_lunch_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_parent_status text;
  new_parent_status text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select w.status into old_parent_status
    from public.lunch_weeks w
    where w.id = old.week_id;
  end if;

  if tg_op = 'DELETE' then
    if old_parent_status = 'published' then
      raise exception 'Ein veröffentlichter Mittagstisch muss vor dem Löschen von Tagen archiviert oder auf Entwurf gesetzt werden.'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  select w.status into new_parent_status
  from public.lunch_weeks w
  where w.id = new.week_id;

  if tg_op = 'UPDATE'
     and old.week_id <> new.week_id
     and old_parent_status = 'published' then
    raise exception 'Tage können nicht aus einer veröffentlichten Woche verschoben werden.'
      using errcode = 'check_violation';
  end if;

  if new_parent_status = 'published' and char_length(btrim(new.dish)) = 0 then
    raise exception 'Ein veröffentlichtes Gericht darf nicht leer sein.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function public.protect_published_lunch_week_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'published' then
    raise exception 'Eine veröffentlichte Mittagstischwoche muss vor dem Löschen archiviert werden.'
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

revoke all on function public.guard_lunch_week_publication() from public, anon, authenticated, service_role;
revoke all on function public.guard_published_lunch_item() from public, anon, authenticated, service_role;
revoke all on function public.protect_published_lunch_week_delete() from public, anon, authenticated, service_role;

create trigger t_lunch_week_publication_guard
  before insert or update on public.lunch_weeks
  for each row execute function public.guard_lunch_week_publication();

create trigger t_lunch_item_publication_guard
  before insert or update or delete on public.lunch_items
  for each row execute function public.guard_published_lunch_item();

create trigger t_lunch_week_delete_guard
  before delete on public.lunch_weeks
  for each row execute function public.protect_published_lunch_week_delete();

create or replace function public.create_lunch_week(_week_start date)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_week_id uuid;
  weekday_number integer;
begin
  if not public.is_staff() then
    raise exception 'Nur Redaktion darf Mittagstischwochen anlegen.'
      using errcode = 'insufficient_privilege';
  end if;

  if extract(isodow from _week_start) <> 1 then
    raise exception 'Eine Mittagstischwoche muss an einem Montag beginnen.'
      using errcode = 'check_violation';
  end if;

  insert into public.lunch_weeks (week_start, week_end, status)
  values (_week_start, _week_start + 4, 'draft')
  returning id into new_week_id;

  for weekday_number in 1..5 loop
    insert into public.lunch_items (week_id, weekday, dish, sort)
    values (new_week_id, weekday_number, '', weekday_number);
  end loop;

  return new_week_id;
end;
$$;

create or replace function public.save_lunch_week(
  _week_id uuid,
  _note text,
  _items jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  supplied_count integer;
  distinct_weekdays integer;
begin
  if not public.is_staff() then
    raise exception 'Nur Redaktion darf Mittagstischwochen bearbeiten.'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(_items) <> 'array' then
    raise exception 'Mittagstisch-Tage müssen als Array übertragen werden.'
      using errcode = 'check_violation';
  end if;

  select count(*), count(distinct x.weekday)
  into supplied_count, distinct_weekdays
  from jsonb_to_recordset(_items) as x(
    weekday integer,
    dish text,
    description text,
    price numeric,
    allergens text,
    sort integer
  );

  if supplied_count <> 5 or distinct_weekdays <> 5 then
    raise exception 'Beim Speichern müssen Montag bis Freitag genau einmal enthalten sein.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(_items) as x(
      weekday integer,
      dish text,
      description text,
      price numeric,
      allergens text,
      sort integer
    )
    where x.weekday not between 1 and 5
       or (x.price is not null and x.price < 0)
  ) then
    raise exception 'Ungültiger Wochentag oder negativer Preis.'
      using errcode = 'check_violation';
  end if;

  update public.lunch_weeks
  set note = nullif(btrim(_note), '')
  where id = _week_id;

  if not found then
    raise exception 'Mittagstischwoche nicht gefunden.'
      using errcode = 'no_data_found';
  end if;

  insert into public.lunch_items (
    week_id,
    weekday,
    dish,
    description,
    price,
    allergens,
    sort
  )
  select
    _week_id,
    x.weekday,
    coalesce(x.dish, ''),
    nullif(btrim(x.description), ''),
    x.price,
    nullif(btrim(x.allergens), ''),
    coalesce(x.sort, x.weekday)
  from jsonb_to_recordset(_items) as x(
    weekday integer,
    dish text,
    description text,
    price numeric,
    allergens text,
    sort integer
  )
  on conflict (week_id, weekday) do update set
    dish = excluded.dish,
    description = excluded.description,
    price = excluded.price,
    allergens = excluded.allergens,
    sort = excluded.sort;
end;
$$;

create or replace function public.copy_lunch_week_to_following(_source_week_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  source_week public.lunch_weeks%rowtype;
  target_week_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Nur Redaktion darf Mittagstischwochen kopieren.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into source_week
  from public.lunch_weeks
  where id = _source_week_id;

  if not found then
    raise exception 'Quellwoche nicht gefunden.'
      using errcode = 'no_data_found';
  end if;

  insert into public.lunch_weeks (week_start, week_end, status, publish_at, note)
  values (
    source_week.week_start + 7,
    source_week.week_end + 7,
    'draft',
    null,
    source_week.note
  )
  returning id into target_week_id;

  insert into public.lunch_items (
    week_id,
    weekday,
    dish,
    description,
    price,
    allergens,
    image_url,
    sort
  )
  select
    target_week_id,
    weekday,
    dish,
    description,
    price,
    allergens,
    image_url,
    sort
  from public.lunch_items
  where week_id = _source_week_id
  order by weekday, sort;

  return target_week_id;
end;
$$;

revoke all on function public.create_lunch_week(date) from public, anon;
revoke all on function public.save_lunch_week(uuid, text, jsonb) from public, anon;
revoke all on function public.copy_lunch_week_to_following(uuid) from public, anon;
grant execute on function public.create_lunch_week(date) to authenticated;
grant execute on function public.save_lunch_week(uuid, text, jsonb) to authenticated;
grant execute on function public.copy_lunch_week_to_following(uuid) to authenticated;

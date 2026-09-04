alter table public.households
add column invite_code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

create unique index households_invite_code_idx on public.households (invite_code);

create or replace function public.create_household(household_name text, member_name text)
returns table (household_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household public.households;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'User already belongs to a household';
  end if;

  insert into public.households (name)
  values (trim(household_name))
  returning * into new_household;

  insert into public.household_members (household_id, user_id, display_name, role)
  values (new_household.id, auth.uid(), trim(member_name), 'owner');

  insert into public.categories (household_id, name, color, icon) values
    (new_household.id, 'Alimentación', '#20A477', 'restaurant'),
    (new_household.id, 'Servicios básicos', '#4C91E8', 'flash'),
    (new_household.id, 'Impuestos', '#8B6FD6', 'document-text'),
    (new_household.id, 'Gasolina', '#E8A838', 'car'),
    (new_household.id, 'Suscripciones', '#EF6A6A', 'repeat'),
    (new_household.id, 'Salud', '#E06C9F', 'medkit'),
    (new_household.id, 'Vivienda', '#6D5EF7', 'home'),
    (new_household.id, 'Transporte', '#4BA3C7', 'bus');

  return query select new_household.id, new_household.invite_code;
end;
$$;

create or replace function public.join_household(code text, member_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare target_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'User already belongs to a household';
  end if;

  select id into target_id from public.households where invite_code = upper(trim(code));
  if target_id is null then raise exception 'Invalid household code'; end if;

  insert into public.household_members (household_id, user_id, display_name, role)
  values (target_id, auth.uid(), trim(member_name), 'member');
  return target_id;
end;
$$;

revoke all on function public.create_household(text, text) from public;
revoke all on function public.join_household(text, text) from public;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;


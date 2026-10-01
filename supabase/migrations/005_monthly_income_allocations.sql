create table if not exists public.monthly_income_allocations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  allocation_month date not null check (extract(day from allocation_month) = 1),
  amount numeric(14,2) not null check (amount > 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, category_id, allocation_month)
);

alter table public.monthly_income_allocations enable row level security;

drop policy if exists "members manage monthly income allocations" on public.monthly_income_allocations;
create policy "members manage monthly income allocations"
on public.monthly_income_allocations
for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create index if not exists monthly_income_allocations_household_month_idx
on public.monthly_income_allocations (household_id, allocation_month, category_id);

insert into public.monthly_income_allocations (household_id, category_id, allocation_month, amount, created_by)
select household_id, category_id, allocation_month, sum(amount), min(created_by::text)::uuid
from public.income_allocations
group by household_id, category_id, allocation_month
on conflict (household_id, category_id, allocation_month)
do update set amount = excluded.amount, updated_at = now();

create or replace function public.replace_monthly_income_allocations(target_household uuid, target_month date, allocation_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  monthly_income numeric(14,2);
  allocation_total numeric(14,2);
begin
  if extract(day from target_month) <> 1 then raise exception 'Month must start on day one'; end if;

  if not public.is_household_member(target_household) then raise exception 'Household not found'; end if;
  if allocation_rows is null then allocation_rows := '[]'::jsonb; end if;
  if jsonb_typeof(allocation_rows) <> 'array' then raise exception 'Allocations must be an array'; end if;

  select coalesce(sum(t.amount), 0) into monthly_income
  from public.transactions t
  where t.household_id = target_household
    and t.kind = 'income'
    and t.occurred_at at time zone 'America/La_Paz' >= target_month
    and t.occurred_at at time zone 'America/La_Paz' < target_month + interval '1 month';

  select coalesce(sum((item->>'amount')::numeric), 0) into allocation_total
  from jsonb_array_elements(allocation_rows) item;

  if allocation_total > monthly_income then raise exception 'Allocated amount exceeds monthly income'; end if;
  if exists (
    select 1 from jsonb_array_elements(allocation_rows) item
    where (item->>'amount')::numeric <= 0
       or not exists (
         select 1 from public.categories c
         where c.id = (item->>'category_id')::uuid
           and c.household_id = target_household
           and c.archived_at is null
       )
  ) then raise exception 'Invalid allocation'; end if;

  delete from public.monthly_income_allocations
  where household_id = target_household and allocation_month = target_month;

  insert into public.monthly_income_allocations (household_id, category_id, allocation_month, amount, created_by)
  select target_household, (item->>'category_id')::uuid, target_month, (item->>'amount')::numeric, auth.uid()
  from jsonb_array_elements(allocation_rows) item;
end;
$$;

revoke all on function public.replace_monthly_income_allocations(uuid, date, jsonb) from public;
grant execute on function public.replace_monthly_income_allocations(uuid, date, jsonb) to authenticated;

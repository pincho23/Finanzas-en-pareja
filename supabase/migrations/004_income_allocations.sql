create table if not exists public.income_allocations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  allocation_month date not null check (extract(day from allocation_month) = 1),
  amount numeric(14,2) not null check (amount > 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, category_id, allocation_month)
);

alter table public.income_allocations enable row level security;

drop policy if exists "members manage income allocations" on public.income_allocations;
create policy "members manage income allocations"
on public.income_allocations
for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create index if not exists income_allocations_household_month_idx
on public.income_allocations (household_id, allocation_month, category_id);

create or replace function public.replace_income_allocations(target_transaction uuid, allocation_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.transactions;
  allocation_total numeric(14,2);
  row_count integer;
begin
  select * into target
  from public.transactions
  where id = target_transaction
    and public.is_household_member(household_id);

  if target.id is null then raise exception 'Transaction not found'; end if;
  if allocation_rows is null then allocation_rows := '[]'::jsonb; end if;
  if jsonb_typeof(allocation_rows) <> 'array' then raise exception 'Allocations must be an array'; end if;

  row_count := jsonb_array_length(allocation_rows);
  select coalesce(sum((item->>'amount')::numeric), 0)
  into allocation_total
  from jsonb_array_elements(allocation_rows) item;

  if row_count > 0 and target.kind <> 'income' then raise exception 'Only income can be allocated'; end if;
  if allocation_total > target.amount then raise exception 'Allocated amount exceeds income'; end if;
  if exists (
    select 1 from jsonb_array_elements(allocation_rows) item
    where (item->>'amount')::numeric <= 0
       or extract(day from (item->>'month')::date) <> 1
       or not exists (
         select 1 from public.categories c
         where c.id = (item->>'category_id')::uuid
           and c.household_id = target.household_id
           and c.archived_at is null
       )
  ) then raise exception 'Invalid allocation'; end if;

  delete from public.income_allocations where transaction_id = target_transaction;

  insert into public.income_allocations (household_id, transaction_id, category_id, allocation_month, amount, created_by)
  select target.household_id, target.id, (item->>'category_id')::uuid, (item->>'month')::date, (item->>'amount')::numeric, auth.uid()
  from jsonb_array_elements(allocation_rows) item;
end;
$$;

revoke all on function public.replace_income_allocations(uuid, jsonb) from public;
grant execute on function public.replace_income_allocations(uuid, jsonb) to authenticated;

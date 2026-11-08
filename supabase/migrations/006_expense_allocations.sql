create table public.expense_allocations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, category_id)
);

alter table public.expense_allocations enable row level security;
create policy "members manage expense allocations" on public.expense_allocations for all
using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create index expense_allocations_transaction_idx on public.expense_allocations (transaction_id);
create index expense_allocations_household_category_idx on public.expense_allocations (household_id, category_id);

insert into public.expense_allocations (household_id, transaction_id, category_id, amount, created_by)
select household_id, id, category_id, amount, created_by from public.transactions
where kind = 'expense' and category_id is not null
on conflict (transaction_id, category_id) do nothing;

create or replace function public.replace_expense_allocations(target_transaction uuid, allocation_rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  target public.transactions;
  allocation_total numeric;
  allocation_count integer;
  single_category uuid;
begin
  select * into target from public.transactions
  where id = target_transaction and public.is_household_member(household_id);
  if target.id is null then raise exception 'Transaction not found'; end if;
  if target.kind <> 'expense' then raise exception 'Only expenses can be split'; end if;

  select coalesce(sum((item->>'amount')::numeric), 0), count(*)
  into allocation_total, allocation_count
  from jsonb_array_elements(coalesce(allocation_rows, '[]'::jsonb)) item;
  if allocation_count > 0 and allocation_total <> target.amount then
    raise exception 'Expense allocations must equal transaction amount';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(allocation_rows, '[]'::jsonb)) item
    where (item->>'amount')::numeric <= 0 or not exists (
      select 1 from public.categories c where c.id = (item->>'category_id')::uuid
      and c.household_id = target.household_id and c.archived_at is null
    )
  ) then raise exception 'Invalid expense allocation'; end if;

  delete from public.expense_allocations where transaction_id = target.id;
  insert into public.expense_allocations (household_id, transaction_id, category_id, amount, created_by)
  select target.household_id, target.id, (item->>'category_id')::uuid, (item->>'amount')::numeric, auth.uid()
  from jsonb_array_elements(coalesce(allocation_rows, '[]'::jsonb)) item;
  select category_id into single_category from public.expense_allocations where transaction_id = target.id limit 1;
  update public.transactions
  set category_id = case when allocation_count = 1 then single_category else null end,
      status = case when allocation_count > 0 then 'classified'::public.transaction_status else 'pending'::public.transaction_status end,
      updated_at = now()
  where id = target.id;
end;
$$;

grant execute on function public.replace_expense_allocations(uuid, jsonb) to authenticated;

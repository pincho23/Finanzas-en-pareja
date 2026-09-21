create table if not exists public.gas_cylinder_changes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  change_date date not null,
  kind text not null default 'actual' check (kind in ('actual', 'planned')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, change_date, kind)
);

alter table public.gas_cylinder_changes enable row level security;

drop policy if exists "members manage gas changes" on public.gas_cylinder_changes;
create policy "members manage gas changes"
on public.gas_cylinder_changes
for all
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create index if not exists gas_changes_household_date_idx
on public.gas_cylinder_changes (household_id, change_date desc);

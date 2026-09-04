create extension if not exists pgcrypto;

create type public.transaction_kind as enum ('income', 'expense');
create type public.transaction_status as enum ('pending', 'classified');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'BOB',
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  primary key (household_id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  color text not null default '#64748B',
  icon text not null default 'ellipsis-horizontal',
  kind public.transaction_kind,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  kind public.transaction_kind not null,
  status public.transaction_status not null default 'pending',
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'BOB',
  occurred_at timestamptz not null,
  description text,
  counterparty text,
  channel text,
  source text not null default 'manual',
  source_fingerprint text,
  account_last4 text,
  card_last4 text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, source_fingerprint)
);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null,
  updated_at timestamptz not null default now()
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.push_tokens enable row level security;

create function public.is_household_member(target uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from household_members where household_id = target and user_id = auth.uid()) $$;

create policy "members read households" on public.households for select using (public.is_household_member(id));
create policy "members read membership" on public.household_members for select using (public.is_household_member(household_id));
create policy "members manage categories" on public.categories for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members manage transactions" on public.transactions for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy "members manage own tokens" on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_household_member(household_id));

create index transactions_household_date_idx on public.transactions (household_id, occurred_at desc);
create index transactions_household_category_idx on public.transactions (household_id, category_id);


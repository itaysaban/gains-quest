-- Extensions
create extension if not exists pgcrypto;

-- Enums
create type public.unit_preference as enum ('kg', 'lb');

-- Shared helper: keeps updated_at fresh on any table that has the column
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiles (1:1 with auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  unit_preference public.unit_preference not null default 'kg',
  weekly_goal_days smallint not null default 3 check (weekly_goal_days between 1 and 7),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

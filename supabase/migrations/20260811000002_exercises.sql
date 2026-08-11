create type public.exercise_category as enum ('push', 'pull', 'legs', 'core', 'cardio');
create type public.equipment_type as enum ('barbell', 'dumbbell', 'machine', 'bodyweight', 'cable', 'band');
create type public.tracking_type as enum ('weight_reps', 'time', 'distance', 'bodyweight_reps');

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade, -- null for built-in system exercises
  name text not null,
  category public.exercise_category not null,
  muscle_groups text[] not null default '{}',
  equipment public.equipment_type not null,
  tracking_type public.tracking_type not null default 'weight_reps',
  is_favorite boolean not null default false,
  is_archived boolean not null default false,
  is_system boolean not null default false,
  custom_fields jsonb not null default '[]'::jsonb, -- [{ key, label, type }]
  notes text,
  photo_url text,
  source_exercise_id uuid references public.exercises(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercises_user_or_system check (
    (is_system = true and user_id is null) or (is_system = false and user_id is not null)
  )
);

-- Unique name per user (soft-deleted/archived exercises don't block reuse of the name)
create unique index exercises_unique_name_per_user
  on public.exercises (user_id, lower(name))
  where is_archived = false and user_id is not null;

-- Keeps seed re-runs idempotent for the built-in library
create unique index exercises_unique_system_name
  on public.exercises (lower(name))
  where is_system = true;

create index exercises_user_id_idx on public.exercises (user_id);
create index exercises_category_idx on public.exercises (category);

alter table public.exercises enable row level security;

create policy "exercises_select" on public.exercises
  for select using (is_system = true or auth.uid() = user_id);
create policy "exercises_insert_own" on public.exercises
  for insert with check (auth.uid() = user_id and is_system = false);
create policy "exercises_update_own" on public.exercises
  for update using (auth.uid() = user_id and is_system = false) with check (auth.uid() = user_id and is_system = false);
create policy "exercises_delete_own" on public.exercises
  for delete using (auth.uid() = user_id and is_system = false);

create trigger exercises_set_updated_at
before update on public.exercises
for each row execute function public.set_updated_at();

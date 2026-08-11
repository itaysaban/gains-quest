create type public.pr_record_type as enum ('max_weight', 'max_reps_at_weight', 'est_1rm', 'session_volume');

-- Append-only ledger: "current PR" = latest/greatest row per (user_id, exercise_id, record_type).
create table public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  record_type public.pr_record_type not null,
  value numeric not null,
  context jsonb not null default '{}'::jsonb,
  logged_set_id uuid references public.logged_sets(id) on delete set null,
  session_id uuid references public.workout_sessions(id) on delete set null,
  achieved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index personal_records_user_exercise_idx on public.personal_records (user_id, exercise_id, record_type, achieved_at desc);

alter table public.personal_records enable row level security;
create policy "personal_records_select_own" on public.personal_records for select using (auth.uid() = user_id);
-- Writes only happen via SECURITY DEFINER functions (owned by the migration role, which bypasses RLS) — never directly from the client.
create policy "personal_records_no_client_write" on public.personal_records for insert with check (false);

create type public.measurement_type as enum ('bodyweight', 'body_fat_pct', 'circumference');

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measurement_type public.measurement_type not null,
  sub_type text, -- e.g. 'waist', 'bicep_left' when measurement_type = 'circumference'
  value numeric not null,
  unit text not null,
  recorded_at date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index body_measurements_user_idx on public.body_measurements (user_id, measurement_type, recorded_at desc);

alter table public.body_measurements enable row level security;
create policy "body_measurements_all_own" on public.body_measurements for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

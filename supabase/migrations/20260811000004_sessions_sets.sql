create type public.session_status as enum ('in_progress', 'completed', 'discarded');
create type public.set_type as enum ('warmup', 'working', 'drop', 'failure');

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  routine_id uuid references public.routines(id) on delete set null,
  name text,
  status public.session_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  paused_duration_seconds int not null default 0,
  notes text,
  total_volume numeric not null default 0,
  total_sets int not null default 0,
  xp_earned int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workout_sessions_user_id_idx on public.workout_sessions (user_id, started_at desc);

alter table public.workout_sessions enable row level security;
create policy "workout_sessions_all_own" on public.workout_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger workout_sessions_set_updated_at before update on public.workout_sessions for each row execute function public.set_updated_at();

-- Exercises attached to a session (copied from the routine at session-start time, or added mid-session).
-- Decoupled from routine_exercises so ad-hoc additions and per-session supersets are independent of the template.
create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  order_index int not null default 0,
  superset_group_id uuid,
  rest_seconds int, -- copied from routine_exercises.rest_seconds at session-start; editable per-session
  created_at timestamptz not null default now()
);

create index session_exercises_session_id_idx on public.session_exercises (session_id);
create index session_exercises_exercise_id_idx on public.session_exercises (exercise_id);

alter table public.session_exercises enable row level security;
create policy "session_exercises_all_own" on public.session_exercises for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.set_user_id_from_session()
returns trigger language plpgsql as $$
begin
  select user_id into new.user_id from public.workout_sessions where id = new.session_id;
  return new;
end;
$$;

create trigger session_exercises_set_user_id
before insert on public.session_exercises
for each row execute function public.set_user_id_from_session();

create table public.logged_sets (
  id uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  set_index int not null default 0,
  set_type public.set_type not null default 'working',
  weight numeric,
  reps int,
  time_seconds int,
  distance_meters numeric,
  rpe numeric check (rpe is null or rpe between 0 and 10),
  rir numeric check (rir is null or rir between 0 and 10),
  is_pr boolean not null default false,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index logged_sets_session_exercise_id_idx on public.logged_sets (session_exercise_id);
create index logged_sets_user_id_idx on public.logged_sets (user_id, completed_at desc);

alter table public.logged_sets enable row level security;
create policy "logged_sets_all_own" on public.logged_sets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger logged_sets_set_updated_at before update on public.logged_sets for each row execute function public.set_updated_at();

create or replace function public.set_user_id_from_session_exercise()
returns trigger language plpgsql as $$
begin
  select user_id into new.user_id from public.session_exercises where id = new.session_exercise_id;
  return new;
end;
$$;

create trigger logged_sets_set_user_id
before insert on public.logged_sets
for each row execute function public.set_user_id_from_session_exercise();

-- Hard-delete only allowed when an exercise has zero logged history (PRD 4.1); otherwise the app should archive it.
create or replace function public.prevent_delete_exercise_with_logs()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.session_exercises where exercise_id = old.id limit 1) then
    raise exception 'Cannot delete an exercise that has logged workout history; archive it instead.';
  end if;
  return old;
end;
$$;

create trigger exercises_prevent_delete_with_logs
before delete on public.exercises
for each row execute function public.prevent_delete_exercise_with_logs();

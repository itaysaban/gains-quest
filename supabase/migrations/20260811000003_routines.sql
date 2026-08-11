create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index routines_user_id_idx on public.routines (user_id);

alter table public.routines enable row level security;
create policy "routines_all_own" on public.routines for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger routines_set_updated_at before update on public.routines for each row execute function public.set_updated_at();

-- Ordered exercises within a routine. Rows sharing superset_group_id are one superset (no rest between).
create table public.routine_exercises (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  order_index int not null default 0,
  superset_group_id uuid,
  target_sets int,
  target_reps_min int,
  target_reps_max int,
  target_weight numeric,
  rest_seconds int,
  created_at timestamptz not null default now()
);

create index routine_exercises_routine_id_idx on public.routine_exercises (routine_id);

alter table public.routine_exercises enable row level security;
create policy "routine_exercises_all_own" on public.routine_exercises for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Denormalize user_id from the parent routine so RLS above stays a simple equality check
create or replace function public.set_user_id_from_routine()
returns trigger language plpgsql as $$
begin
  select user_id into new.user_id from public.routines where id = new.routine_id;
  return new;
end;
$$;

create trigger routine_exercises_set_user_id
before insert on public.routine_exercises
for each row execute function public.set_user_id_from_routine();

create table public.routine_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('days_of_week', 'rotation')),
  days_of_week int[], -- 0=Sunday..6=Saturday
  rotation_routine_ids uuid[], -- ordered A/B/C rotation
  rotation_anchor_date date,
  notify boolean not null default true,
  notify_time time not null default '08:00',
  created_at timestamptz not null default now()
);

create index routine_schedules_user_id_idx on public.routine_schedules (user_id);

alter table public.routine_schedules enable row level security;
create policy "routine_schedules_all_own" on public.routine_schedules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Atomically clone a routine + its exercises (e.g. "Week 2" variation)
create or replace function public.fn_duplicate_routine(p_routine_id uuid, p_new_name text default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new_id uuid;
begin
  insert into public.routines (user_id, name, description)
  select user_id, coalesce(p_new_name, name || ' (Copy)'), description
  from public.routines where id = p_routine_id and user_id = auth.uid()
  returning id into v_new_id;

  if v_new_id is null then
    raise exception 'Routine not found or not owned by caller';
  end if;

  insert into public.routine_exercises (
    routine_id, exercise_id, order_index, superset_group_id,
    target_sets, target_reps_min, target_reps_max, target_weight, rest_seconds
  )
  select v_new_id, exercise_id, order_index, superset_group_id,
         target_sets, target_reps_min, target_reps_max, target_weight, rest_seconds
  from public.routine_exercises
  where routine_id = p_routine_id and user_id = auth.uid();

  return v_new_id;
end;
$$;

grant execute on function public.fn_duplicate_routine(uuid, text) to authenticated;

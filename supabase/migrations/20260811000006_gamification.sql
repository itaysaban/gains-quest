create type public.xp_event_type as enum ('set_logged', 'session_completed', 'streak_bonus', 'badge_unlocked');

-- Append-only XP ledger: total XP = sum(xp_amount). Never mutated, only inserted — auditable and replayable.
create table public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.workout_sessions(id) on delete set null,
  logged_set_id uuid references public.logged_sets(id) on delete set null,
  event_type public.xp_event_type not null,
  xp_amount int not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index xp_events_user_idx on public.xp_events (user_id, created_at desc);

alter table public.xp_events enable row level security;
create policy "xp_events_select_own" on public.xp_events for select using (auth.uid() = user_id);
create policy "xp_events_no_client_write" on public.xp_events for insert with check (false);

-- Seeded reference: xp_required(level) = floor(100 * level^1.5), level 1 = 0
create table public.level_thresholds (
  level int primary key,
  xp_required int not null
);

alter table public.level_thresholds enable row level security;
create policy "level_thresholds_read_all" on public.level_thresholds for select using (true);

-- Cached/derived from xp_events so Home can read it without summing the ledger every time
create table public.user_levels (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_xp int not null default 0,
  current_level int not null default 1,
  xp_into_level int not null default 0,
  xp_for_next_level int not null default 100,
  updated_at timestamptz not null default now()
);

alter table public.user_levels enable row level security;
create policy "user_levels_select_own" on public.user_levels for select using (auth.uid() = user_id);

-- Primary streak metric: consecutive calendar days with >=1 completed session
create table public.streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak_days int not null default 0,
  longest_streak_days int not null default 0,
  last_workout_date date,
  streak_freezes_available int not null default 1,
  streak_freeze_used_dates date[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.streaks enable row level security;
create policy "streaks_select_own" on public.streaks for select using (auth.uid() = user_id);

create type public.badge_category as enum ('strength', 'consistency', 'exploration', 'volume');

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  category public.badge_category not null,
  icon text not null default 'trophy',
  criteria jsonb not null, -- machine-readable, e.g. {"type":"streak_days","value":30}
  created_at timestamptz not null default now()
);

alter table public.badges enable row level security;
create policy "badges_read_all" on public.badges for select using (true);

create table public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  seen boolean not null default false,
  unique (user_id, badge_id)
);

alter table public.user_badges enable row level security;
create policy "user_badges_select_own" on public.user_badges for select using (auth.uid() = user_id);
create policy "user_badges_update_own_seen" on public.user_badges for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_badges_no_client_insert" on public.user_badges for insert with check (false);

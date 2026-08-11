create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rest_timer_enabled boolean not null default true,
  routine_reminders_enabled boolean not null default true,
  streak_warnings_enabled boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;
create policy "notification_preferences_all_own" on public.notification_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger notification_preferences_set_updated_at before update on public.notification_preferences for each row execute function public.set_updated_at();

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  device_info text,
  updated_at timestamptz not null default now()
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
create policy "push_tokens_all_own" on public.push_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

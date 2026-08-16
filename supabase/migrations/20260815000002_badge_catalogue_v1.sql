-- M3 Epic 3, Story 3.1: re-seed the badge catalogue with the PRD's v1.0 list. Clean cutover — no
-- production users have unlocked any of the old 8 badges yet, so this deletes and replaces rather
-- than migrating old rows.
--
-- Point values and descriptions confirmed against two sources: epics.md's Story 3.2 AC text (exact
-- criteria types + a few point values), and the user's Figma screenshot of the Achievement Hall
-- (exact point values + description copy for First Workout, Speed Demon, Iron Will, Century Club,
-- Social Butterfly). Where neither source gave a number — Progressive Overload, Architect, Unbroken,
-- Well Rounded — the point value below is an estimated placeholder, flagged in epics.md for
-- confirmation; the criteria themselves are not estimates, they're taken directly from epics.md.
--
-- Social Butterfly: epics.md specifies a `friend_count` criteria type (stubbed false until M4's
-- friends system ships — see Story 3.2). The Figma screenshot's description text for this badge reads
-- "Give 50 High-Fives", a different mechanic that doesn't exist anywhere in this app. Kept the
-- friend_count mechanic (it has a full, already-tested AC) and wrote description copy that's honest
-- about what's actually gated, rather than shipping copy that promises a feature that isn't there.
-- Flagged in epics.md for confirmation.
--
-- `points` is added defensively with IF NOT EXISTS: originally shipped in 20260813000001_badge_points.sql,
-- which turned out (2026-08-16, discovered via a real deploy failure) to have never actually reached
-- production, despite an earlier assumption to the contrary based on a documentation comment rather
-- than a direct check. This migration no longer depends on that one having run.
alter table public.badges add column if not exists points integer not null default 100;

delete from public.user_badges;
delete from public.badges;

alter table public.badges alter column category type text;
drop type public.badge_category;
create type public.badge_category as enum ('onboarding', 'cardio', 'consistency', 'volume', 'social', 'progression', 'variety');
alter table public.badges alter column category type public.badge_category using category::public.badge_category;

insert into public.badges (code, name, description, category, icon, criteria, points) values
  ('first_workout', 'First Workout', 'Complete your first workout', 'onboarding', 'locate',
    '{"type":"session_count","value":1}'::jsonb, 500),
  ('speed_demon', 'Speed Demon', 'Run 5km under 25 min', 'cardio', 'flash',
    '{"type":"cardio_time_for_distance","distance_km":5,"max_minutes":25}'::jsonb, 1000),
  ('iron_will', 'Iron Will', 'Complete a 7-day streak', 'consistency', 'flame',
    '{"type":"streak_days","value":7}'::jsonb, 750),
  ('century_club', 'Century Club', 'Log 100 workouts', 'volume', 'trophy',
    '{"type":"session_count","value":100}'::jsonb, 2000),
  ('social_butterfly', 'Social Butterfly', 'Make 5 training friends', 'social', 'people',
    '{"type":"friend_count","value":5}'::jsonb, 750),
  ('progressive_overload', 'Progressive Overload', 'Beat your estimated 1RM on the same exercise 3 sessions in a row', 'progression', 'trending-up',
    '{"type":"est_1rm_beaten_consecutive_sessions","value":3}'::jsonb, 1000),
  ('architect', 'Architect', 'Complete the same custom routine 5 times', 'variety', 'construct',
    '{"type":"custom_routine_completions","value":5}'::jsonb, 500),
  ('tonnage', 'Tonnage', 'Lift a cumulative 100,000kg', 'volume', 'barbell',
    '{"type":"cumulative_volume_kg","value":100000}'::jsonb, 2500),
  ('unbroken', 'Unbroken', 'Complete a 30-day streak', 'consistency', 'infinite',
    '{"type":"streak_days","value":30}'::jsonb, 1500),
  ('well_rounded', 'Well Rounded', 'Log 4 different workout types in one week', 'variety', 'apps',
    '{"type":"distinct_workout_types_in_week","value":4}'::jsonb, 750);

-- Routine folder/program grouping (free-text tag, e.g. "Push Pull Legs") — optional per PRD.
alter table public.routines add column folder text;

-- Free-text coaching note per routine exercise (routine-builder authoring aid).
alter table public.routine_exercises add column note text;

-- Target rep range copied onto the session at start time (alongside the existing rest_seconds copy)
-- so progression suggestions have something to compare a session's actual reps against.
alter table public.session_exercises add column target_reps_min int;
alter table public.session_exercises add column target_reps_max int;

-- Quick-start sessions (not tied to a routine) record which activity type was picked, e.g. "running".
alter table public.workout_sessions add column workout_type text;

-- Device-local calendar date the session belongs to, distinct from started_at's UTC timestamp.
-- Populated by the client going forward; streak calculation itself is not rewired to use this yet
-- (that's a follow-on change alongside the streak rest-allowance/freeze work).
alter table public.workout_sessions add column local_date date;

-- Per-user, configurable progressive-overload increments (PRD 6.1.4: "both increments user-configurable").
alter table public.profiles add column progression_upper_increment_kg numeric not null default 2.5;
alter table public.profiles add column progression_lower_increment_kg numeric not null default 5;
alter table public.profiles add column progression_deload_pct numeric not null default 10;

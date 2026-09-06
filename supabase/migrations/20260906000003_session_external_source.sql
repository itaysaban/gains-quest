-- Health-sync schema hook — PRD §3 / §8, decided 2026-09-06 (§11: "write-back first, import later").
--
-- These two columns are added now and stay unused until v1.1. That is deliberate sequencing, not
-- scope creep: adding nullable columns to a small table costs nothing today, whereas retrofitting
-- source tracking onto a live workout_sessions table later means a migration plus a backfill plus an
-- ambiguity — every pre-existing row's provenance would be unknowable.
--
-- The dedupe key specifically has to exist BEFORE the first write-back ships, not before import:
-- once GainQuest starts pushing sessions into Apple Health / Google Fit, any later import path has
-- to be able to recognise its own exports and skip them, or a session written out and read back
-- becomes two workouts. Nothing can reconstruct that link after the fact.
--
-- No CHECK constraint on external_source: import is not designed yet, and pinning the accepted
-- values now would just mean a second migration when whoever builds it settles the domain. The
-- comment below is the contract until then.

alter table public.workout_sessions
  add column if not exists external_source text,   -- null (logged in-app) | apple_health | google_fit
  add column if not exists external_id text;       -- the source system's own id for this workout

-- Partial unique index: a given user can hold each external workout exactly once, while every
-- in-app session (external_id null) is unconstrained. Postgres does not treat nulls as equal, so a
-- plain unique index would also work — the WHERE clause makes the intent explicit and keeps the
-- index off the rows that will always be the overwhelming majority.
--
-- Built now while the table is small. On a live table with real history this is the expensive part,
-- not the columns.
create unique index if not exists idx_workout_sessions_external
  on public.workout_sessions (user_id, external_source, external_id)
  where external_id is not null;

comment on column public.workout_sessions.external_source is
  'Origin of an imported/exported session: null = logged in GainQuest, otherwise apple_health | google_fit. Unused until v1.1 (PRD §3).';
comment on column public.workout_sessions.external_id is
  'The external system''s id for this workout. Dedupe key so a session written out to Health is not re-imported as a second workout.';

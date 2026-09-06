-- Quick Start offers ten workout types, but six of them — Yoga, Boxing, Tennis, Soccer, Basketball,
-- Hockey — had no matching exercise anywhere in the library. Tapping them started an empty session
-- and left the user searching a library that could not answer, which is worse than not offering the
-- tile at all.
--
-- These are duration activities: you do not count reps of football, you play for an hour. So they are
-- tracking_type 'time', which the cardio GP award already covers
-- (fn_award_points_for_session sums seconds for 'time' and 'distance_duration').
--
-- Names are deliberately chosen so the Quick Start tile's search term matches them — tapping Run
-- pre-types "Run", tapping Hockey pre-types "Hockey". A rename here silently breaks that tile, so
-- keep the names and QUICK_START_TYPES in add-workout/index.tsx in step.
--
-- category is constrained to push|pull|legs|core|cardio, so every sport lands in 'cardio'. That is a
-- taxonomy limitation rather than a claim that boxing is a cardio session.
--
-- Idempotent via the same exercises_unique_system_name partial index every other system insert uses.

insert into public.exercises (user_id, name, category, muscle_groups, equipment, tracking_type, is_system) values
  -- Yoga
  (null, 'Yoga Flow', 'cardio', array['core','legs'], 'bodyweight', 'time', true),
  (null, 'Yoga Hold', 'cardio', array['core'], 'bodyweight', 'time', true),
  -- Boxing
  (null, 'Boxing', 'cardio', array['cardio','shoulders'], 'bodyweight', 'time', true),
  (null, 'Shadow Boxing', 'cardio', array['cardio','shoulders'], 'bodyweight', 'time', true),
  (null, 'Heavy Bag Boxing', 'cardio', array['cardio','shoulders'], 'machine', 'time', true),
  -- Racquet and team sports
  (null, 'Tennis', 'cardio', array['cardio'], 'bodyweight', 'time', true),
  (null, 'Soccer', 'cardio', array['cardio','legs'], 'bodyweight', 'time', true),
  (null, 'Basketball', 'cardio', array['cardio','legs'], 'bodyweight', 'time', true),
  (null, 'Ice Hockey', 'cardio', array['cardio','legs'], 'bodyweight', 'time', true),
  -- Gives the Cycle tile a second option, so it is not a single-result list like the sports are
  (null, 'Indoor Cycling', 'cardio', array['cardio','legs'], 'machine', 'distance_duration', true)
on conflict do nothing;

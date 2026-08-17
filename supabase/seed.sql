-- Badges are seeded by their own migrations (20260815000002_badge_catalogue_v1.sql, corrected by
-- 20260816000002_badge_prd_corrections.sql) — the v1.0 catalogue against the real PRD, not this file.
-- level_thresholds no longer exists (20260817000001_drop_legacy_xp_system.sql, M3 Epic 3 Story 3.3's
-- hard cutover) — GainPoints (point_ledger) replaced the old XP/level system entirely.

-- Built-in exercise library (system exercises, visible to every user, user_id null)
insert into public.exercises (user_id, name, category, muscle_groups, equipment, tracking_type, is_system) values
  (null, 'Barbell Back Squat', 'legs', array['quadriceps','glutes','hamstrings'], 'barbell', 'weight_reps', true),
  (null, 'Barbell Bench Press', 'push', array['chest','triceps','shoulders'], 'barbell', 'weight_reps', true),
  (null, 'Conventional Deadlift', 'pull', array['hamstrings','glutes','back'], 'barbell', 'weight_reps', true),
  (null, 'Overhead Press', 'push', array['shoulders','triceps'], 'barbell', 'weight_reps', true),
  (null, 'Barbell Row', 'pull', array['back','biceps'], 'barbell', 'weight_reps', true),
  (null, 'Pull-Up', 'pull', array['back','biceps'], 'bodyweight', 'bodyweight_reps', true),
  (null, 'Push-Up', 'push', array['chest','triceps'], 'bodyweight', 'bodyweight_reps', true),
  (null, 'Dumbbell Bicep Curl', 'pull', array['biceps'], 'dumbbell', 'weight_reps', true),
  (null, 'Dumbbell Shoulder Press', 'push', array['shoulders','triceps'], 'dumbbell', 'weight_reps', true),
  (null, 'Leg Press', 'legs', array['quadriceps','glutes'], 'machine', 'weight_reps', true),
  (null, 'Leg Curl Machine', 'legs', array['hamstrings'], 'machine', 'weight_reps', true),
  (null, 'Lat Pulldown', 'pull', array['back','biceps'], 'cable', 'weight_reps', true),
  (null, 'Cable Tricep Pushdown', 'push', array['triceps'], 'cable', 'weight_reps', true),
  (null, 'Cable Face Pull', 'pull', array['shoulders','back'], 'cable', 'weight_reps', true),
  (null, 'Banded Lateral Walk', 'legs', array['glutes'], 'band', 'weight_reps', true),
  (null, 'Plank', 'core', array['core'], 'bodyweight', 'time', true),
  (null, 'Hanging Leg Raise', 'core', array['core'], 'bodyweight', 'bodyweight_reps', true),
  (null, 'Treadmill Run', 'cardio', array['cardio'], 'bodyweight', 'distance', true),
  (null, 'Rowing Machine', 'cardio', array['cardio','back'], 'machine', 'distance', true)
on conflict do nothing;

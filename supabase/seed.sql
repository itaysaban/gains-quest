-- Level thresholds: xp_required(level) = floor(100 * level^1.5), level 1 starts at 0 XP
insert into public.level_thresholds (level, xp_required)
select lvl, floor(100 * power(lvl, 1.5))::int
from generate_series(1, 100) as lvl
on conflict (level) do nothing;

update public.level_thresholds set xp_required = 0 where level = 1;

-- Badges (Strength / Consistency / Exploration / Volume — PRD 4.5)
insert into public.badges (code, name, description, category, icon, criteria) values
  ('first_workout', 'First Rep', 'Complete your first workout session.', 'consistency', 'flag', '{"type":"session_count","value":1}'),
  ('streak_7', 'Week Warrior', 'Hit a 7-day training streak.', 'consistency', 'flame', '{"type":"streak_days","value":7}'),
  ('streak_30', '30-Day Streak', 'Hit a 30-day training streak.', 'consistency', 'flame', '{"type":"streak_days","value":30}'),
  ('exercises_10', 'Tried 10 Custom Exercises', 'Create 10 custom exercises.', 'exploration', 'compass', '{"type":"exercise_count_created","value":10}'),
  ('sessions_50', 'Half Century', 'Complete 50 workout sessions.', 'consistency', 'medal', '{"type":"session_count","value":50}'),
  ('squat_100kg', 'First 100kg Squat', 'Squat 100kg for the first time.', 'strength', 'trending-up', '{"type":"max_weight_for_exercise","exercise_name":"Barbell Back Squat","value":100}'),
  ('bench_100kg', 'First 100kg Bench', 'Bench press 100kg for the first time.', 'strength', 'trending-up', '{"type":"max_weight_for_exercise","exercise_name":"Barbell Bench Press","value":100}'),
  ('deadlift_140kg', 'First 140kg Deadlift', 'Deadlift 140kg for the first time.', 'strength', 'trending-up', '{"type":"max_weight_for_exercise","exercise_name":"Conventional Deadlift","value":140}')
on conflict (code) do nothing;

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

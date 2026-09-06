-- Treadmill Run and Rowing Machine were seeded as tracking_type 'distance' (distance only, no
-- duration). Every comparable exercise — Outdoor Run, Stationary Bike, Elliptical Trainer, Stair
-- Climber, Swimming, even Sled Push — is 'distance_duration'. There is no reason a treadmill run
-- has no duration when an outdoor run does, and the mis-typing has three real consequences:
--
--   1. The logging screen renders no time input for them, so a duration cannot be recorded at all.
--   2. fn_award_points_for_session sums cardio seconds only for tracking_type in
--      ('time','distance_duration'), so these two earn ZERO cardio GP however long you go.
--   3. No duration means no pace, so cardio PRs (20260906000005) can never fire for them.
--
-- Found when a real treadmill run earned nothing. Reclassifying is the whole fix: it restores the
-- time field, the GP and PR eligibility in one change, with no code touched.
--
-- Existing logged_sets keep their distance_meters and simply have a null time_seconds — historical
-- rows are not back-filled, because the duration was never captured and inventing one would put
-- fabricated pace records into users' histories.

update public.exercises
set tracking_type = 'distance_duration'
where is_system = true
  and tracking_type = 'distance'
  and name in ('Treadmill Run', 'Rowing Machine');

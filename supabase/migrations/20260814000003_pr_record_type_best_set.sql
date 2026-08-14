-- New PR type: best single-set volume (weight * reps for one set), distinct from session_volume
-- (which sums an entire session). Own migration so the enum value commits before use below.
alter type public.pr_record_type add value 'best_set_volume';

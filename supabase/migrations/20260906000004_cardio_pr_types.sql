-- Cardio personal records — PRD §6.1.4, §11 decision 2026-09-06 ("v1.0, and not parallel").
--
-- Enum values only. Postgres will not let a new enum value be USED in the same transaction that adds
-- it, so detection lives in the next migration — same split 20260814000003 used when it added
-- 'best_set_volume'. Applying this file alone is safe and inert: nothing writes these yet.
--
-- Before this, pr_record_type was max_weight | max_reps_at_weight | est_1rm | session_volume |
-- best_set_volume — every one of them weight-based, so a cardio-only user could set no record at
-- all, reach 1 of 3 daily quests, and earn 1 of 10 badges.

alter type public.pr_record_type add value if not exists 'best_pace';
alter type public.pr_record_type add value if not exists 'longest_distance';
alter type public.pr_record_type add value if not exists 'longest_duration';

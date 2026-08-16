-- M3 Epic 3, Story 3.1 (correction): 20260815000002_badge_catalogue_v1.sql was built from epics.md's
-- paraphrase of the PRD, not the PRD itself (never seen directly until now, fetched from Notion
-- 2026-08-16). Three of the four "estimated" point values and one category turn out to be spec'd
-- exactly in PRD section 6.4 — not actually ambiguous, just a document the build never had access to.
-- Also adds the "Emoji Banner" column from that same table, which the original build missed entirely
-- (used Ionicons vector icons instead).
update public.badges set points = 1500 where code = 'progressive_overload';
update public.badges set points = 1000, category = 'progression' where code = 'architect';
update public.badges set points = 3000 where code = 'unbroken';
-- Social Butterfly's mechanic (friend_count, 5) and 750 points were already correct -- only the
-- description text drifted from the PRD's exact wording.
update public.badges set description = 'Add 5 friends' where code = 'social_butterfly';

update public.badges set icon = '🎯' where code = 'first_workout';
update public.badges set icon = '⚡' where code = 'speed_demon';
update public.badges set icon = '🔥' where code = 'iron_will';
update public.badges set icon = '💯' where code = 'century_club';
update public.badges set icon = '🦋' where code = 'social_butterfly';
update public.badges set icon = '💪' where code = 'progressive_overload';
update public.badges set icon = '📐' where code = 'architect';
update public.badges set icon = '🏋🏻‍♀️' where code = 'tonnage';
update public.badges set icon = '⛓️' where code = 'unbroken';
update public.badges set icon = '🫡' where code = 'well_rounded';

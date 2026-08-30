---
stepsCompleted: [1, 2, 3]
inputDocuments: ["notion:PRD: GainQuest — Gamified Training Rebrand (v1.0) (https://app.notion.com/p/3bb45eeb2b0d80ea9764cf06941df14e)", "supabase/migrations/20260811000006_gamification.sql", "supabase/migrations/20260813000001_badge_points.sql", "supabase/migrations/20260811000008_functions_triggers.sql"]
milestoneScope: "M3 — Game layer only (per PRD §10). M1/M2 already shipped. M4/M5 out of scope."
---

# GainQuest - Epic Breakdown (M3 — Game Layer)

## Overview

This document provides the epic and story breakdown for GainQuest's **M3 milestone only** — the game layer (point ledger, streaks with allowance and freezes, Achievement Hall, badge engine) — decomposed from the PRD hosted in Notion ("PRD: GainQuest — Gamified Training Rebrand (v1.0)"). No separate Architecture.md or UX design document exists for this project; the PRD's own §7 (design spec) and §8 (data model) serve that role, supplemented by direct inspection of the already-shipped Supabase schema (M1/M2).

**Load-bearing discovery from requirements extraction:** M3 is not greenfield. `supabase/migrations/20260811000006_gamification.sql` and `20260813000001_badge_points.sql` already implement a working XP/Level/Streak/Badge system, wired into `fn_complete_session` (M1/M2's session-completion RPC). That system uses a materially different model than this PRD (XP+Levels vs. GainPoints-only; a simple 1-freeze streak vs. rest-allowance + earned-freeze; an 8-badge catalogue vs. the PRD's 10). Per user decision (2026-08-14): **full replace** — retire the XP/Level system and the old streak/badge logic, build the PRD's model as their direct replacement, with a clean cutover (no production user data to migrate, per assumption confirmed at requirements-gathering).

## Implementation Status (updated 2026-08-14)

- **Epic 1 (Earn GainPoints From Every Session): DONE, live-Postgres verified 2026-08-15.** All 5 stories shipped — `supabase/migrations/20260814000006_point_ledger.sql` through `20260814000010_point_reversal_recalc.sql`, plus `types/database.types.ts`/`types/domain.ts` updates and hook tests. Strictly additive per the resequencing note on Story 1.1: the old XP/Level system is untouched and still running; `point_ledger` accumulates in parallel with no UI reading it yet. Typecheck + full test suite green (131 tests).
  - **Scope note:** Story 1.5's delete/recalculate capability is server + hook only — no delete/edit-a-past-workout UI exists anywhere in the app yet, discovered during implementation (not a pre-existing screen this story was supposed to wire into).
  - **Known, accepted rounding gap found 2026-08-17 (user confirmed leave-as-is):** `fn_award_points_for_session`'s daily-ceiling scaling (`20260814000010_point_reversal_recalc.sql`) computes `v_scale = headroom / points_earned` once, then floors each of the 5 components (base/volume/cardio/pr/routine) independently before inserting. Right at the boundary — small headroom against a much larger pre-cap total — every component can floor to 0 even though real headroom remained, silently losing up to a few GP that a single lump-sum floor would have preserved. Surfaced via a live production report ("0 points for a <10 min workout with logged exercises") that was actually the account sitting at 399/400 GP from heavy manual testing, not a duration bug — the base-award rule (≥1 set OR ≥10 min, `v_total_sets > 0 or v_duration_seconds >= 600`) already works correctly. Only bites an account already saturated at the daily cap; not expected from real training. Not fixed.
- **Epic 2 (Build and Protect a Training Streak): DONE, live-Postgres verified 2026-08-15.** All 6 stories shipped — `supabase/migrations/20260814000011_streak_rest_allowance_freezes.sql` (Stories 2.1-2.4: rest allowance derived from the existing `profiles.weekly_goal_days`, earned/banked freezes capped at 2, day-by-day break evaluation, 4am-grace local-date boundary via `lib/utils/date.ts`'s `trainingLocalDate`), `20260814000012_streak_recalculation.sql` (Story 2.3's `fn_rebuild_streak` full-replay on delete/edit), and `20260814000013_pause_mode.sql` (Story 2.5: `fn_enable_pause_mode`, clamped to the remaining quarterly budget rather than rejected). Story 2.6's reminder/at-risk notification policy lives client-side in `lib/notifications/streakReminder.ts` (pure decision logic, unit-tested) + `hooks/useStreakReminder.ts` (wired into Home), reusing M1's `expo-notifications` local-notification infrastructure and the existing `notification_preferences.streak_warnings_enabled` toggle. New Settings screen `app/(tabs)/settings/pause-mode.tsx` lets a user enable Pause Mode. Typecheck + full test suite green (151 tests).
  - **Confirmed 2026-08-14 (see notes throughout the Epic 2 stories above):** Pause Mode (FR18) stays separate from the rest allowance (FR13) — different columns, different triggers, never share state. The "logged an injury" AC was dropped from Story 2.6 (no such feature exists anywhere in the app). FR11's 48h edit-block (Epic 1) and FR2's ≥1 set OR ≥10 min base-award rule were both confirmed as-is, no changes needed.
  - **Scope note:** Story 2.6's "historical training pattern" time-of-day is a simple mode-of-hour over recent completed sessions (falls back to 6pm with no history) — reasonable-call implementation, not spec'd to a specific algorithm in the PRD.
- **Live-Postgres verification (2026-08-15):** applied all 21 migrations to a real disposable Supabase project and ran 52 scenario tests exercising `fn_complete_session`, `fn_award_points_for_session`, `fn_update_streak`, `fn_rebuild_streak`, `fn_enable_pause_mode`, `fn_delete_completed_session`, and `fn_recalculate_session_points` against real data — the SQL logic in both epics had never actually executed anywhere before this. Found and fixed 3 real bugs (all now patched in the migration files, re-verified green):
  1. **`fn_update_streak` crashed on every single call** — `select ... from streaks s left join profiles p ... for update` is illegal Postgres (`FOR UPDATE cannot be applied to the nullable side of an outer join`). This means `fn_complete_session` — the RPC every workout completion calls — would have failed 100% of the time in production. Fixed to `for update of s` in `20260814000011` and `20260814000013`.
  2. **Orphaned old `fn_update_streak(uuid)` overload** left behind when Story 2.4 introduced the new two-arg version — a default parameter doesn't replace a different-arity function in Postgres, so both coexisted. Not actively called by anything live, but a footgun (a stray 1-arg call would have silently run pre-Epic-2 streak logic). Dropped explicitly in `20260814000011`.
  3. **Backfilled sessions were repairing broken streaks** — a real regression against Story 1.4's AC ("does not repair a currently-broken streak"). It held trivially when Story 1.4 was built (streak logic ignored `local_date` entirely then), but Story 2.4 later started passing a session's own `local_date` into `fn_update_streak` unconditionally, including for backfilled sessions — silently reintroducing exactly the gaming vector Story 1.4 was written to prevent. Fixed in `fn_complete_session` (`20260814000011`) to skip the streak call entirely for a backfilled completion.
  - **Documentation mismatches found and resolved 2026-08-15 (confirmed with the user):**
    - Story 1.3's AC had its two example clauses swapped ("45s + 0 sets, or 90s + 2 sets" — literally read, "45s + 0 sets" should stay trivial under the implemented AND-of-both-thresholds rule). Corrected to "45s + 2 sets, or 90s + 0 sets", each of which clears exactly one threshold. The implementation was already correct against the intended meaning; only the doc text was wrong.
    - Story 1.4's AC requires "established history (≥3 prior sessions)" before flagging an implausible load jump, but the shipped code flagged on any single prior session. User chose to tighten the code to match the AC — `fn_award_points_for_session` (`20260814000010_point_reversal_recalc.sql`) now counts distinct prior sessions and only flags when ≥3 exist.
  - Test harness (Node + `pg`, throwaway Supabase project) is in the scratchpad, not committed to the repo — SQL logic itself is now verified, this was a one-time check rather than a durable CI asset. 58 scenario assertions total (28 Epic 1, 30 Epic 2), all green after the above fixes.
- **Production deployment gap found 2026-08-15:** none of migrations `20260814000006` through `20260814000013` (all of Epic 1 and Epic 2) had ever been applied to the production Supabase project — confirmed via `fn_enable_pause_mode` failing with a PostgREST "not found in schema cache" error during manual testing, then a column/function existence sweep pinpointing the exact boundary (`20260814000001`-`20260814000005` were live; everything from `20260814000006` on was not). User deployed the 8 pending files as one consolidated script via the production SQL Editor. **`supabase_migrations.schema_migrations` does not exist on this project** — migrations have never been tracked via the Supabase CLI here, so this kind of drift can recur; worth setting up CLI-tracked migrations (`supabase link` + `supabase db push`) at some point so "what's live" stops requiring a manual diagnostic query.
- **Story 2.5 extended 2026-08-15:** added `fn_cancel_pause_mode` (`20260815000001_pause_mode_cancel.sql`) + an "End Pause Mode" button, found missing during the user's manual production testing — see the added AC on Story 2.5 above. Code is built, typechecked, and passes 5 new live-Postgres scenario tests (58 total now) against the test project — **but per user decision 2026-08-15, deployment to production is deferred and will be bundled with Epic 3's migrations as one batch, rather than deployed standalone.** User does not want one-off SQL scripts handed over for every small fix going forward; Epic 3's eventual production deploy should be the next one, covering this plus everything Epic 3 adds.
- **Epic 3, Stories 3.1/3.2/3.4/3.5: DONE, live-Postgres verified 2026-08-15 — built autonomously while the user was away, per their explicit go-ahead ("auto accepted... until we get to story 3.3").** Story 3.3 (the hard XP/Level cutover) is deliberately NOT started — held for the user's return, per their own instruction, since it's the irreversible step. What shipped:
  - `20260815000002_badge_catalogue_v1.sql` (Story 3.1): deletes the old 8 badges + `user_badges` (clean cutover, no unlocks existed yet), replaces the `badge_category` enum (`onboarding, cardio, consistency, volume, social, progression, variety`), seeds exactly the 10 PRD v1.0 badges.
  - `20260815000003_badge_criteria_v1.sql` (Stories 3.2 + 3.5, combined — both redefine `fn_check_badges`): adds the 5 new criteria evaluators (`cumulative_volume_kg`, `custom_routine_completions`, `distinct_workout_types_in_week`, `cardio_time_for_distance`, `est_1rm_beaten_consecutive_sessions`) plus the `friend_count` always-false stub; every unlock now also inserts a `source: 'achievement'` `point_ledger` entry tagged with the badge's id, exempt from the daily ceiling by construction (the ceiling only ever sums base/volume/cardio/pr/routine).
  - Story 3.4: `components/gamification/AchievementList.tsx` now colors each badge's icon by category (7 new `theme.badge*` tokens, matched to the user's Figma), locked/unlocked/points states unchanged (already correct pre-existing structure) — screen already read live `badges`/`user_badges` data, no hardcoded list.
  - `lib/theme.ts`: added `badgeOnboarding/Cardio/Consistency/Volume/Social/Progression/Variety` tokens (light + dark), kept deliberately separate from the semantic danger/warning/info/success tokens even where the hue matches, so badge-category styling can't drift if those tokens' meaning changes later.
  - `types/database.types.ts`: `BadgeCategory` updated to the new 7-value set.
  - Live-Postgres verification: 25 new scenario tests (`test-epic3.js` in the scratchpad harness) covering every new criteria type, the achievement-GP-exempt-from-ceiling behavior, and the Progressive Overload "consecutive sessions" edge case (a non-PR session in the middle correctly breaks the streak). All 83 scenario assertions across Epic 1/2/3 are green (28 + 30 + 25).
  - **Found and fixed one Epic-1-test regression, not a product bug:** deleting a session no longer nets lifetime GP back to exactly 0 in a test that incidentally triggered the "First Workout" achievement — because achievement GP is correctly *not* reversed by session deletion (an unlocked achievement is a permanent accomplishment, independent of whether the triggering session still exists; `fn_check_badges`'s `point_ledger` insert deliberately has no `session_id`, so `fn_reverse_session_points`'s `where session_id = p_session_id` never touches it). The test was updated to isolate the case it's actually about (session-sourced point reversal) rather than the product code being changed.
  - **Design/estimation decisions — all confirmed by the user 2026-08-15:**
    - **4 of 10 badges' point values are estimated**, not sourced from the PRD or the Figma (neither had them): Progressive Overload 1000, Architect 500, Unbroken 1500, Well Rounded 750. **Confirmed as-is by the user, no change.** The other 6 are exact (First Workout 500, Speed Demon 1000, Iron Will 750, Century Club 2000, Social Butterfly 750, Tonnage 2500 — from the Figma screenshot and/or epics.md's own text).
    - **Social Butterfly**: the Figma's "Give 50 High-Fives" mechanic and copy do not match epics.md's already-decided `friend_count` criteria (5 friends, stubbed false until M4's friends system ships). **User confirmed: no high-five system will ever be built — drop that mechanic entirely, keep `friend_count`, and treat its 750 points as an estimate** (same footing as the other 4 estimated badges, not tied to the dropped Figma mechanic). No code change needed — the shipped version already uses `friend_count` + honest copy ("Make 5 training friends").
    - **The badge-catalogue delete is confirmed safe to run**: user checked and doesn't have (or doesn't care about losing) any old-system badge unlocks in production — ran without the "check what you'd lose" query first, explicitly accepting the loss ("i would lose my old first workout badge i dont care anout it").
    - **Architect's "custom routine" interpretation**: read as "the same routine completed 5 times" (loyalty to one routine you built), not "5 sessions using any routine" — every routine in this schema is user-owned (no system/template concept the way exercises have one), so "custom" only makes sense as emphasis, and "Architect" (a builder/creator name) fits the repeated-use reading better. Tested both interpretations explicitly; only the same-routine-5x case unlocks it.
    - **Progressive Overload's "3 sessions running"** is scoped per-exercise: the most recent 3 sessions (for that specific exercise, not overall workout sessions) must each have set a new est_1RM PR, with no non-PR session in between. Confirmed via a dedicated test.
  - **Deployed to production 2026-08-16.** Migrations `20260815000001` (pause mode cancel, previously deferred) through `20260815000003` (badge catalogue + criteria) are live. First attempt failed (`column "points" of relation "badges" does not exist` — the `20260813000001_badge_points.sql` gap described above); fixed by making `20260815000002` add that column itself (`if not exists`), re-verified against the test project, redeployed successfully on the second attempt. Achievement Hall, Pause Mode's cancel button, and all 10 v1.0 badges are now live and testable in the real app. Still nothing pushed to GitHub — code is committed locally only.
  - **Bug found in manual testing 2026-08-16, fixed same day:** `fn_cancel_pause_mode` charged the full requested day count against the quarterly budget even when cancelled the same day it was enabled — a 3-day pause started and immediately cancelled still burned all 3 days. First fix (`20260816000001_pause_mode_cancel_refund.sql`) made the refund time-based (days granted minus days actually elapsed). Postgres also rejected changing the function's return type (`void` → `jsonb`) via `CREATE OR REPLACE` alone — needed an explicit `DROP FUNCTION` first, caught before a second failed production deploy.
  - **Refined same day per explicit user request: the refund should also be activity-aware, not just time-based.** A day the user trained through during the pause shouldn't be charged at all, even if it elapsed — only genuinely-used (no-workout) rest days should consume the quota. `20260816000003_pause_mode_activity_aware_refund.sql` (superseded again below) made the refund time-based-plus-activity-aware, but still by recomputing `days_granted` from `streaks.paused_until - streaks.pause_started_at` — which broke a second time when the user's manual testing (backdating only `pause_started_at`, not `paused_until`) desynced those two fields, since the "charge upfront, refund on cancel" model has no independent record of what was actually granted.
  - **Redesigned 2026-08-16, per explicit user request ("deduct them the moment a day passes" rather than "restore days you lost by pressing pause"): replaced the mutable `pause_days_used_this_quarter` counter entirely with a `pause_periods` ledger table + `fn_pause_days_used_this_quarter()`, computed fresh from real history every time, never stored/mutated.** `20260816000004_pause_periods_ledger.sql`:
    - `pause_periods(user_id, started_at, ended_at)` — one row per pause request; `ended_at` is corrected down to the real last day when cancelled early, never deleted or re-derived from other columns.
    - `fn_pause_days_used_this_quarter(p_user_id)` sums, across every period overlapping the current quarter, the elapsed days with no completed session that day. Found and fixed a real authorization gap while writing this: the function took an arbitrary `p_user_id` with no check it matched the caller, before it ever touched any database — added an explicit `p_user_id <> auth.uid()` check.
    - `fn_enable_pause_mode`/`fn_cancel_pause_mode` no longer write `streaks.pause_days_used_this_quarter`/`pause_quarter_start` at all — those columns are now dead, superseded, left in place rather than dropped (lower-risk than a destructive schema change, and harmless to leave unused).
    - Client (`pause-mode.tsx`) now calls a new `usePauseDaysUsedThisQuarter()` query hook instead of reading the stale streaks columns.
    - This eliminates the whole bug class: there is no longer a running counter that can desync from reality, however it's edited. 6 scenario tests rewritten/added for the ledger model, including the user's exact reported repro (backdating only `pause_started_at` via manual SQL, then cancelling) — asserted to never produce a negative or nonsensical result.
    - **Known gap, still not addressed:** no reconciliation path for a pause that expires *naturally* (never explicitly cancelled) is needed anymore — `fn_pause_days_used_this_quarter` always computes fresh from `pause_periods` + real workout history regardless of whether `fn_cancel_pause_mode` ever ran, so a natural expiry is already handled correctly by construction. This concern from the prior (counter-based) design no longer applies.
  - **Not yet deployed** — three superseding migrations exist for this one feature (`20260816000001` → `20260816000003` → `20260816000004`); only `20260816000004` (plus the still-pending `20260816000002` badge corrections) needs to go out. The earlier two are moot history, not separate deploy steps.
  - **The actual PRD (Notion, "PRD: GainQuest — Gamified Training Rebrand v1.0") was fetched and read in full for the first time 2026-08-16.** Every prior story in this epics.md was built from epics.md's own paraphrase of the PRD, never the source document — that's the root cause of nearly every "estimated" or "flagged" gap logged above. Reading it directly resolved several at once, in `20260816000002_badge_prd_corrections.sql`:
    - **PRD section 6.4 has an explicit "Emoji Banner" column** — each badge should show its actual emoji (🎯 ⚡ 🔥 💯 🦋 💪 📐 🏋🏻‍♀️ ⛓️ 🫡), not a vector icon. Missed entirely in the original build (used Ionicons). `AchievementList.tsx` now renders `badge.icon` as text directly.
    - **3 of the 4 "estimated" point values were not actually ambiguous** — the PRD spec'd them exactly: Progressive Overload 1500 (was estimated 1000), Architect 1000 + category "Progression" not "Variety" (was estimated 500, wrong category), Unbroken 3000 (was estimated 1500). Well Rounded's 750 estimate happened to match exactly.
    - **Social Butterfly's mechanic and 750 points were correct all along** — PRD literally says "Add 5 friends" (i.e. `friend_count >= 5`, exactly what was built). The Figma's "Give 50 High-Fives" text was apparently just mockup copy, not the real spec. Description text corrected to match the PRD's exact wording.
  - **Two more gaps surfaced by reading the PRD, not yet acted on — flag for the user:**
    - PRD section 6.3 says no streak notification "if the user has logged an injury" — a real feature, not something to drop. Story 2.6 dropped this AC on 2026-08-14 on the assumption that no injury-flag feature exists anywhere in the app (true) and therefore couldn't have been intended (turns out it was intended, just never built). Whether to add an injury flag is a scope decision for the user; not built.
    - PRD section 9 says backfilling is capped at "up to 7 days back" — a hard eligibility limit, separate from the 50%-discount rule already built (which applies regardless of how far back). `fn_award_points_for_session`/session creation currently allow backfilling any distance into the past. Not enforced; flagging rather than guessing at the right rejection behavior.
- **Epic 3, Story 3.3 — UI half DONE 2026-08-16, DB half (the hard cutover) still deliberately held.** The user supplied a full, high-fidelity design handoff (`design_handoff_gainquest/`: `README.md` + `GainQuest Screens.html`, 8 screens total) built directly against the real PRD. Scoped explicitly to the Achievement Hall only for now — the other 7 screens (Home, Add Workout, Active Session, Session Summary, Routine Builder, Exercise Picker, Leaderboard) are separate, later work; Leaderboard doesn't even have a backend yet (M4).
  - **Design system foundation, shared app-wide (approved by the user):** `lib/theme.ts` now carries the handoff's exact final palette (previously an improvised placeholder) — every screen's *colors* shift as a result, but no other screen's *layout* changed. Loaded the 3 real font families the design specifies (Barlow Condensed, Barlow, JetBrains Mono via `@expo-google-fonts/*` + `expo-font`, wired into `app/_layout.tsx` with a loading gate) rather than approximating with system fonts. `components/ui/Text.tsx` gained `font`/`size` props for the new type scale — fully backward compatible, every other screen keeps rendering exactly as before since they don't pass the new props. Tab bar chrome (`app/(tabs)/_layout.tsx`) recolored to match, since it's shared visual chrome the Achievement Hall itself sits inside.
  - **Achievement Hall rebuilt to match the handoff exactly:** `StreakHeroCard.tsx` (flame tile + streak numbers, plus a new 3-stat row: rest allowance remaining this week, freezes banked, Pause Mode availability), new `LifetimeCard.tsx` (Total GP / Sessions / Volume / PRs set / Season rank [M4 placeholder, "—"] / Badges), `AchievementList.tsx` (now renders each badge's real emoji banner, plus **live progress on locked badges** — "Log 100 sessions · 84 / 100" — a genuinely new feature the handoff called for, not present before).
  - **Two new server functions for the above, both read-only/additive, tested:** `fn_badge_progress` (`20260816000005_badge_progress.sql`) computes live progress for the 5 criteria types with a natural linear reading (session_count, streak_days, cumulative_volume_kg, custom_routine_completions, distinct_workout_types_in_week); the other 3 (cardio_time_for_distance, est_1rm_beaten_consecutive_sessions, friend_count) return null rather than a fabricated number, and the client falls back to plain requirement text for those. `fn_lifetime_stats` (`20260816000006_lifetime_stats.sql`) returns all 6 LIFETIME numbers in one round trip. Both check `p_user_id = auth.uid()` from the start this time — no repeat of the earlier authorization gap. 12 new scenario tests (46 total in Epic 3 now), all passing.
  - **Verification:** typecheck clean, full local suite green (153 tests), and a full production web bundle export (`expo export --platform web`) compiles with no errors — catches real runtime/import issues `tsc` alone wouldn't. **Not verified visually** — the app requires real authentication to reach this screen, which wasn't done in this environment; the user needs to check it renders correctly on their own device before considering this done. **Not yet deployed** — `20260816000005` and `20260816000006` need to go out before the new hooks will resolve (same failure pattern as every other RPC-not-deployed-yet case this session).
  - **Still deliberately NOT done (as of 2026-08-16):** the DB-level hard cutover — dropping `xp_events`/`user_levels`/`level_thresholds`, removing the XP inserts from `fn_complete_session`/`fn_process_logged_set`, swapping Home's "Points" tile to real GP. Achievement Hall no longer *shows* the old XP/Level bar (removing it was a natural side effect of matching the new design, which doesn't include one), but the underlying tables/functions are untouched and Home is unaffected — this is a UI-only, fully reversible change, not the irreversible DB step. That step remains a separate decision to check in on.
- **Epic 3, Story 3.3 — the hard cutover: CODE DONE 2026-08-17, live-Postgres verified, NOT YET DEPLOYED to production (irreversible — awaiting the user's explicit go-ahead).** `20260817000001_drop_legacy_xp_system.sql`:
  - Redefined the 3 live functions that wrote to `xp_events` — `fn_process_logged_set` (both the warm-up and working-set inserts), `fn_check_badges` (the `badge_unlocked` insert; the `point_ledger` achievement insert stays), `fn_complete_session` (the session-completion insert, plus all the `xp_before`/`xp_after`/`level_before`/`level_after` bookkeeping and the `xp_earned`/`leveled_up`/`new_level` return fields — `points_earned` from `fn_award_points_for_session` is now the only "how much did I earn" field). Redefined `handle_new_user` to stop bootstrapping a `user_levels` row for new signups.
  - Then dropped, in dependency order: trigger `xp_events_update_level`, function `fn_update_user_level`, function `fn_calculate_set_xp`, the now-dead `workout_sessions.xp_earned` column (nothing wrote it anymore once the above landed), and finally tables `user_levels`/`xp_events`/`level_thresholds` and the orphaned `xp_event_type` enum.
  - Confirmed `fn_award_points_for_session`, `fn_reverse_session_points`, `fn_delete_completed_session`, `fn_recalculate_session_points`, and `fn_rebuild_streak` never touched the old tables — no changes needed there, GP has been a fully separate system since Epic 1.
  - **Client changes:** Home's "Points" tile now reads `useLifetimeStats().total_gp` instead of `useUserLevel().total_xp`; `XpBar` (and the `Card` wrapping it) removed from Home entirely and the component file deleted; session completion (`session/active.tsx` → `session/summary.tsx`) now passes/reads `pointsEarned` instead of `xpEarned`/`leveledUp`/`newLevel`, and the summary screen's card reads "GP EARNED" with no Level Up message; the read-only past-session detail screen (`progress/session/[sessionId].tsx`) now shows GP via a new `useSessionPoints(sessionId)` hook (sums `point_ledger` live by `session_id` — there's no persisted per-session points column, matching the "derive from the ledger, never a mutable counter" principle FR6 already established) instead of the dropped `xp_earned` column.
  - `types/domain.ts`/`types/database.types.ts`: removed `XpEvent`/`UserLevel`/`XpEventType` and the `xp_events`/`user_levels`/`level_thresholds` table types; `fn_complete_session`'s return type dropped `xp_earned`/`leveled_up`/`new_level`.
  - `supabase/seed.sql`: removed the `level_thresholds` seed and the stale pre-Story-3.1 8-badge insert block (superseded by the migrations; would have collided on `code = 'first_workout'` against the real v1.0 catalogue if it ever ran after them).
  - **Verification:** typecheck clean, full local suite green (153 tests, mock RPC payloads updated to the new return shape). Migration applied cleanly to the disposable test project — confirmed all 3 tables, both functions, the trigger, the enum, and the column are gone; re-ran all 114 existing scenario tests (28 Epic 1 + 40 Epic 2 + 46 Epic 3) against the migrated schema, all still green; confirmed a fresh signup still gets a `streaks` row with no error now that `user_levels`'s insert is gone.
  - **Not yet deployed to production.** This is the irreversible step — once run there, the old per-user XP/level numbers are gone for good. Per the user's own standing instruction, production deploys of anything schema-destructive wait for their explicit go-ahead even under a general "auto-accept" instruction; the migration file is ready to hand over.
  - **Deploy attempt 2026-08-30 failed:** `ERROR: 42P01: relation "public.xp_events" does not exist`. Root cause: `drop trigger if exists xp_events_update_level on public.xp_events;` has `IF EXISTS` on the trigger, but Postgres still needs the *table* named after `ON` to exist just to parse the statement — that one line was the only non-idempotent statement in the whole migration. The disposable test project (which has been through this same migration history all session) confirms the implied state: it also has zero legacy XP tables but all four redefined functions present and correct, meaning production is apparently already past the point this migration exists to reach — either it partially ran before (the original script has no `BEGIN`/`COMMIT`, so a multi-statement paste may commit incrementally), or `xp_events` never existed there to begin with. Fixed forward rather than editing `20260817000001` in place (it already touched a real deployment target — this exact error came from running it against production) — `20260824000001_drop_legacy_xp_system_fix.sql` is a complete, standalone, fully idempotent replacement: byte-for-byte identical function redefinitions (harmless to reapply either way) plus the same trailing `IF EXISTS` drops, with the one broken line rewritten as a guarded `DO` block that only attempts the trigger drop if `xp_events` actually exists. Verified by applying it to the test project (succeeds against the same already-cut-over state production is in) and a smoke test confirming `fn_complete_session` still awards GP correctly afterward.
- **PRD re-read 2026-08-17 to resolve a navigation question ("where do I see GP earned per workout"), full PRD fetched and reviewed again:**
  - **The app's "Progress" tab (calendar heatmap, per-exercise history, volume chart, body measurements) is not part of the PRD's documented information architecture at all.** §7.2 specifies a 4-tab bottom bar — Home, Add Workout, Achievements, Leaderboard — with no Progress tab. It's pre-existing/legacy (M1/M2), not spec'd for or against by this PRD; not a gap to fix, just out of scope for it.
  - **GP-per-workout is already correctly satisfied per spec.** §7.4 places "GP earned" on the **Session Summary** screen, shown once, immediately after finishing that workout — already built and working post-cutover. The PRD does not call for any screen to browse past workouts and see GP for each one; the closest thing, §6.1.5's "Exercise history," is per-*exercise* (opened from an exercise card/library, not a standalone tab) and was never meant to carry a GP total either. **User confirmed leave the current Progress-tab navigation as-is** — no PRD-mandated change here.
  - **§11's open question resolved by user decision (2026-08-17), for whenever M4/Leaderboards starts:** "Does the Home Rank tile show global tier rank or friends rank?" — **both ranks should exist on the Leaderboard: a social/friends rank (position among friends) and a separate global rank (position globally).** Not the same number, not one-or-the-other. M4 hasn't started; nothing to build yet, but this removes the ambiguity §6.2 flagged for whenever it does. **Mirrored into the Notion PRD itself** (§6.2's callout and §11's checklist item both updated to reflect the resolution) — not just this doc.
- **The design handoff's remaining 7 screens (deferred during Story 3.3, "Achievement Hall now, rest later") — DONE 2026-08-17, built autonomously per explicit go-ahead ("start working on the other rebranded screens... leave anything that needs confirmation and work on what you can"), NOT verified visually (no live login in this environment).** Covers every M1/M2 screen the handoff redesigned; Leaderboard is the one screen intentionally left untouched (see below).
  - **Session Summary:** itemised GAINPOINTS card straight from `point_ledger` (new `useSessionPointBreakdown`/`useTodayPointsEarned` hooks in `hooks/useGamification.ts`, plus a `streakMultiplier()` display-only helper in new `lib/utils/points.ts` mirroring `fn_award_points_for_session`'s own tier table), gradient header, RECORDS card, and a real **Discard** button wired to the existing-but-previously-UI-less `fn_delete_completed_session`/`useDeleteCompletedSession` (Epic 1 Story 1.5 shipped this server-side with no destination yet — this is that destination). `session/active.tsx` now passes `sessionId` through to the summary route so those hooks have something to query. Share-to-feed toggles skipped — no social feed backend to share into (M4).
  - **Home:** "Start today's routine" gradient CTA (routes straight into the session, not through Add Workout), a third stat tile ("Tier rank") added as an honest `—` placeholder — same pattern as the LIFETIME card's Season rank, no leaderboard backend exists yet. Social Feed section dropped entirely, not hidden — no friends/activity backend to read from; a hardcoded feed would fabricate data.
  - **Add Workout:** restructured per the PRD's own §7.3 verdict ("needs restructuring — no route to routine-building") into Today's routine / My routines / Quick start. Challenges (F6) dropped entirely — P2 in the PRD's own feature table, and there's no challenges table/backend anywhere in the app; same "don't fabricate progress data" reasoning as the dropped Social Feed.
  - **Exercise Picker** (`components/exercise/ExercisePicker.tsx`, shared by 3 screens): real category filter chips (push/pull/legs/core/cardio — the app's actual `ExerciseFilters.category`, not the mockup's muscle-group labels, which aren't a filterable column). Kept single-select-and-close rather than the mockup's multi-select "Add N exercises" footer — a real interaction-model change across all 3 embedding screens, not a visual one, so not taken on unsupervised.
  - **Routine Builder:** restyled both steps of the app's existing two-step flow (`routines/new.tsx` for name/folder, `routines/[routineId]/index.tsx` + `RoutineExerciseRow.tsx` for the exercise list) rather than merging them into the mockup's single screen — same "behavior change vs. visual change" line as the picker. Added a computed "SUPERSET A/B/…" label (one per distinct `superset_group_id`, shown on each group's first item).
  - **Active Session** (highest priority per both the PRD and the handoff): header now shows the routine name plus a live "mm:ss · kg" mono line (volume computed client-side from the session's own logged sets) and a real Finish button; `SessionTimer.tsx` deleted (superseded, no longer imported anywhere). Kept the existing pause/resume icon — real, working functionality the mockup's simplified preview just didn't depict. Restyled `RestTimerBar`, `ExerciseCardHeader`, `LastSessionRow`, `SetRow`, `DraftSetRow`, `SetInputAdjuster`, `ProgressionChip` to the new palette/typography, but kept every existing interaction mechanism (the stepper-based `SetInputAdjuster`, the toast-based PR celebration in `PrBadge.tsx`) rather than rebuilding to match the mockup's non-interactive preview exactly — this is the app's highest-traffic, highest-risk screen and none of those mechanisms were broken.
  - **Leaderboard** (`app/(tabs)/leaderboard.tsx`) — deliberately **not** touched. It's already an honest `EmptyState` placeholder ("coming soon... friends and global rankings are on the way") inside the confirmed 4-tab shape; there's no ranking/tier/season backend to build a real version against yet (M4), so there was no design opportunity here beyond what already exists correctly.
  - **Verification:** typecheck clean after every batch, full local suite green (153 tests — one assertion in `ProgressionSuggestion.e2e.test.tsx` updated to match the handoff's exact copy change, "Try +2.5kg today" → "Hit top of range last time — try +2.5kg"), a full production web bundle export compiles after each batch. **Not verified visually anywhere in this pass** — same caveat as Achievement Hall, no live login in this environment; Active Session in particular needs a real on-device check before considering it done, given how central it is.
  - Committed in 4 batches (`79a6733` Home/Add Workout/Session Summary, `67b3fec` Exercise Picker/Routine Builder, `ac2b924` Active Session) — not pushed yet, awaiting the user's return.
- **Unit test coverage for the design-handoff rebrand's new client-side logic — DONE 2026-08-18 (`06822bd`).** User approved a proposed test plan (published as an artifact) covering everything from the rebrand that had zero coverage: `lib/utils/points.ts`'s `streakMultiplier`/`pointSourceLabel` (cross-checked against the PRD's §6.2 tier table), the three `point_ledger`-reading hooks in `useGamification.ts` (`useSessionPointBreakdown`, `useTodayPointsEarned`, and `useSessionPoints` — added in the hard-cutover work and untested until now), and Session Summary's Discard button (confirm/cancel/mutate/navigate, PRD §9). Extracted two computations that were inline in their route files into pure, directly-testable functions, behavior unchanged: `supersetLabel`/`isSupersetLinkedToPrevious` (→ `lib/utils/routine.ts`) and `computeLiveVolume` (→ `lib/utils/session.ts`, PRD §6.1.4's warmup-exclusion rule). 36 new tests, full suite 153 → 189.
- **M4 (Social), Story 1 — Friends: CODE DONE 2026-08-18, live-Postgres verified, NOT YET DEPLOYED to production.** Per the PRD's release plan (§10), M4 is next after M3. Rather than blocking all of M4 on the still-open leaderboard-tier-size question (§11), started with the one piece that's unambiguous per the PRD and is a real prerequisite for both the Friends leaderboard and the social feed. `20260818000001_friends.sql`:
  - Single-table design: a friendship is one `friend_requests` row, status `'accepted'` — no separate mutable "friends" table to keep in sync, same "derive, don't duplicate" reasoning as `point_ledger` (PRD §8). `fn_search_users` (SECURITY DEFINER, returns id/display_name/avatar_url/relationship only — profiles stay friends-only by default per PRD §9, this is the one controlled window through that), `fn_send_friend_request`, `fn_respond_friend_request` (addressee-only, re-sending after a decline flips the same row back to pending rather than duplicating it), `fn_remove_friend` (either party, deletes the row outright), `fn_list_friends`, `fn_pending_friend_requests` (incoming only). All four read functions carry the `auth.uid()` self-check.
  - **`fn_check_badges`'s `friend_count` case now reads real data** instead of the always-false stub from Story 3.2 — Social Butterfly ("Add 5 friends", PRD §6.4) can unlock for the first time.
  - **Scoped out of this pass:** "invite by link" (PRD's "Friends and Invite" screen also describes this) — a separate deep-linking mechanism, deferred rather than built half-specified. Both leaderboards, seasons, the social feed, and reactions are still fully unstarted — this is Friends only.
  - **Client:** `hooks/useFriends.ts` (6 hooks), new screen `app/(tabs)/settings/friends.tsx` — search + incoming requests + friends list, linked from Settings. Not part of the design handoff ("Friends and Invite" was explicitly "not designed in this pass"), so styled to match the *other* Settings sub-screens' existing plain style (Button/Card/TextField, no gradient/mono display font) rather than introducing the new design language into just one corner of a stack the rebrand never otherwise touched.
  - **Verification:** 34 new live-Postgres scenario tests (`test-epic4.js`, disposable test project) — found and fixed one real bug this way (an untyped `case when ... then 'accepted' else 'declined' end` needs an explicit `::friend_request_status` cast to assign into the enum column; Postgres infers the bare expression as `text`). 7 new Jest hook tests. Full suite now 196 (up from 189). Typecheck clean, web bundle export compiles.
  - **Not yet deployed to production** and **not pushed** — same standing rule as every schema change this session; the migration is ready to hand over whenever the user wants to run it.
  - **Still explicitly NOT started (as of 2026-08-18):** both leaderboards, seasons, the social feed, reactions.
  - **Follow-up 2026-08-18, from live device testing:** Friends was only reachable via Achievement Hall → avatar → Settings → Friends — three taps deep, user reported "can't see search anywhere." Added a direct shortcut icon on Home's header instead (`e5a4177`).
- **M4 Story 2 — Leaderboards: CODE DONE 2026-08-18, live-Postgres verified, NOT YET DEPLOYED to production.** User explicitly asked to stop blocking on §11's open tier-size question and ship an MVP — took the design handoff's own example (100 lifters/tier) as the default rather than waiting on that call; `TIER_SIZE` is the one constant that changes if it's revisited later. `20260819000001_leaderboard.sql`:
  - `fn_leaderboard(p_scope)` — `'global'` returns only the caller's own ~100-person tier, ranked by **current-season** GP (`point_ledger.season_id`, unused until now — no new points infrastructure needed); `'friends'` is unbounded, always includes the caller (even with 0 friends or 0 season GP), and a friend with 0 season GP still appears, ranked last, not omitted. Every row carries `is_self` for the client to highlight. Real bug caught during verification: the function's own `RETURNS TABLE(..., user_id uuid, ...)` output columns are usable as bare identifiers inside the function body, which silently shadowed a same-named CTE column in one `WHERE` clause ("column reference is ambiguous") — fixed by qualifying it.
  - `fn_lifetime_stats` (redefined again) now returns a real `season_rank` instead of always omitting it — null (never a fabricated number) when the caller has no season_id activity yet this month. Home's "Tier rank" tile and Achievement Hall's LIFETIME "Season rank" cell both read this now instead of a hardcoded `—`.
  - **Not built in this pass:** season rollover archival (§6.2's "final standings are archived to the user's profile" — only the current season is queryable, no history), promotion/relegation logic (the design handoff's "promotion top 20" line implies an active mechanic; nothing processes it, so the built screen omits that line rather than showing something that doesn't do anything), the podium graphic and "▲ N since yesterday" delta (no historical rank snapshots to compute a delta from), and the §6.2 refresh-cadence spec (15-minute cache for other rows, near-real-time for the caller's own — plain query caching for MVP). The Leaderboard screen is a straightforward ranked list, not those visual/mechanical flourishes.
  - **Client:** `useLeaderboard(scope)` in `hooks/useGamification.ts`; `app/(tabs)/leaderboard.tsx` rebuilt from its placeholder into a real Global/Friends toggle + ranked list, "no friends yet" invite-prompt empty state (per PRD §9's edge case) reusing `useFriends()` to detect it.
  - **Verification:** 22 new live-Postgres scenario tests (`test-epic5.js`). Found and worked around a *test-design* trap, not a product bug: this is a shared, long-lived scratch DB with hundreds of point_ledger rows from every other epic's tests this session, all in the same real-world season — ordinary point values risked 2-3 fresh test users landing in *different* tiers purely from unrelated pollution ranked between them. Fixed by granting deliberately dominant GP values (10^9-scale) in the tier-sensitive assertions so they're robust regardless of what else is in the table. 2 new Jest hook tests. Full suite now 198 (up from 196). Typecheck clean, web bundle export compiles.
  - **Not yet deployed to production, not pushed** — same standing rule as every schema change this session.
  - **Still explicitly NOT started:** seasons-as-a-concept beyond the current one, the social feed, reactions.
- **M4 Story 3 — Social Feed: CODE DONE 2026-08-20, live-Postgres verified, NOT YET DEPLOYED to production.** PRD §6.5: "Friend activity cards showing who did what and when, with a heart reaction... default the feed to activity type and duration only, with weights and loads opt-in." `20260820000001_social_feed.sql`:
  - `feed_events` (session_completed | pr_set | badge_unlocked, `metadata jsonb` carrying activity shape only — duration/set-count/workout-type or exercise-name/record-type/pr-count, **never** a weight or volume number, per §6.5's privacy default) and `feed_reactions` (one heart per user per event, unique constraint). Both friends-only-visibility RLS (self + accepted friends, re-derived independently on `feed_reactions` since RLS on one table doesn't extend through a join to another). `fn_friend_feed(p_limit, p_before)` — paginated, reverse-chronological, re-implements the same visibility check explicitly (SECURITY DEFINER functions bypass RLS entirely, running as owner). `fn_toggle_reaction` — re-validates visibility server-side rather than trusting the client caught this on a visible event.
  - `fn_complete_session` (redefined again) now posts one `session_completed` event every completion, plus one `pr_set` event when the session set at least one PR (carries the first PR's exercise/record type + a count, not a card per individual PR — avoids flooding the feed on a big PR day). `fn_check_badges` (redefined again) posts one `badge_unlocked` event per badge, alongside the existing `user_badges`/`point_ledger` inserts.
  - **Scoped out of this pass:** `streak_milestone` events (`fn_update_streak` has a long, hard-won bug-fix history this session — not touched again without a specific driving need) and the per-session "share weights" opt-in toggle from the Session Summary mockup (every session posts at the default privacy level until that toggle exists). "Invite by link" and reactions beyond a single heart are likewise out of scope — the PRD only ever specifies one reaction type.
  - **Client:** `hooks/useFeed.ts` — `useFriendFeed` (`useInfiniteQuery`, cursor-paginated on `created_at`) and `useToggleReaction` (optimistic update/rollback on the cached pages, same `onMutate`/`onError`/`onSettled` pattern as `useNotificationPreferences`). `components/social/FeedList.tsx` — event cards per type, heart reaction, "Load more", "no friends yet" empty state (reuses `useFriends()`, links to Find Friends) vs. "nothing yet" for a friended-but-inactive feed. Wired into Home as a new Social Feed section, replacing the placeholder note that used to explain why it was dropped entirely.
  - **Verification:** 22 live-Postgres scenario tests (`test-epic6.js`). Two real findings during verification, both resolved as test-design fixes rather than product bugs: (1) a session logging a *different* (even lighter) weight than a prior session on the same exercise still triggers a `pr_set` event, because `max_reps_at_weight` is scoped per-exact-weight-value — the first time any specific weight is ever logged, it trivially sets a new "max reps at that weight" record regardless of magnitude; a true "no new PR" test needs an *exact* repeat of weight/reps, not just a lighter one. (2) the scratch DB harness's `postgres` role has `rolbypassrls = true` (confirmed via `pg_roles`), so a raw direct-`select` test can never validate an RLS policy over that connection — removed that test; the real protection is the policy itself plus `fn_friend_feed`'s own explicit re-check, already covered by the "only includes self + accepted friends" test. 5 new Jest hook tests (`Feed.e2e.test.tsx`) — the first attempt at the two `useToggleReaction` tests used a naive `renderHook` + bare `act()` + `waitFor` pattern and flaked in this environment; rewritten to seed the query cache directly via `queryClient.setQueryData` and wrap `mutate`/`mutateAsync` in `await act(async () => { ...; await Promise.resolve(); })`, matching the working convention already established in `NotificationPreferencesOptimistic.test.tsx`. Full suite now 203 (up from 198), later 205 once Story 4 landed. Typecheck clean.
  - **Not yet deployed to production, not pushed.**
- **M4 Story 4 — Challenges: CODE DONE 2026-08-21, live-Postgres verified, NOT YET DEPLOYED to production.** PRD F6 (P2). Navigation confirmed by the user via AskUserQuestion: a section inside the existing Add Workout screen, not a 5th bottom tab. Deliberately **not** the same shape as the separate, still-unapproved Daily Quests draft (`daily-quests-feature.md` — per-user-inferred, one-per-day); Challenges is a small, fixed, server-config pool of week-scoped challenges every user sees the same set of, individually tracked, no personalization. `20260821000001_challenges.sql`:
  - `challenge_templates` (server-config catalogue, same "tunable without an app release" spirit as badges — `metric` one of `sessions_completed` | `new_prs` | `total_sets`, `target_value`, `points`) seeded with 3 templates: "Get Moving" (3 sessions, 150 GP), "Chase a Record" (1 new PR, 100 GP), "Grind It Out" (20 working sets, 100 GP). `user_challenges` tracks one row per user per template per ISO week (server-clock UTC `date_trunc('week', current_date)`, not per-user-local-timezone — same "ship the smallest thing" reasoning as the leaderboard's tier-size default). `fn_active_challenges(p_user_id)` lazily assigns the current week's rows on first read, recomputes progress live from source tables on every read (no incremental maintenance, no new hook into `fn_complete_session` — a P2 feature's aggregate doesn't warrant touching that function's already-long history again), and awards GP (`point_ledger` source `'challenge'`, added to the check constraint, exempt from the 400 GP/day session ceiling by the same construction as `'achievement'` — the ceiling sum only ever lists `base|volume|cardio|pr|routine`) exactly once, the read that first crosses the target flips `status` `active` → `completed`.
  - **Two real bugs found and fixed during verification, before/during scenario testing:** (1) `workout_sessions.local_date` is nullable and left unset for a normal (non-backfilled) session — every date filter in the function needed `coalesce(local_date, started_at::date)`, matching the codebase-wide convention already used in `fn_complete_session`/`fn_update_streak`/streak recalculation; missing this would have silently excluded every ordinary session from progress. (2) the `new_prs` metric originally did `count(*)` on `personal_records`, but a single first-time lift can set up to 4 record-type rows at once (`max_weight`, `max_reps_at_weight`, `est_1rm`, `best_set_volume`) — switched to `count(distinct exercise_id)`, matching how a lifter actually thinks about "I hit a PR on X" rather than internal record-type dimensions.
  - **Scoped out of this pass:** personalization/inference (Daily Quests' job, not approved), a feed tie-in ("your friend completed a challenge" — would need a new `feed_events.event_type`), and challenge history beyond the current week (no archive of past weeks' outcomes).
  - **Client:** `hooks/useChallenges.ts` (`useActiveChallenges`), `components/social/ChallengesSection.tsx` (progress bar + GP/checkmark per card), wired into `app/(tabs)/add-workout/index.tsx` as a new CHALLENGES section, replacing the placeholder note that used to explain why it was dropped entirely.
  - **Verification:** 16 new live-Postgres scenario tests (`test-epic7.js`) — including a test-design trap similar to Story 3's: isolating a "sessions only" test from also tripping the `new_prs` challenge required backdating a baseline PR-setting session into the *previous* week, since the very first lift on any exercise always sets a PR regardless of weight/reps, and later identical-weight repeats alone don't avoid that first one. 2 new Jest hook tests. Full suite now 205 (up from 203). Typecheck clean.
  - **Not yet deployed to production.** Committed and pushed to `origin/master` as `7bfd60d` (bundled with Story 3 — both stories' code landed together). A combined deployment script bundling Friends + Leaderboard + Social Feed + Challenges (`deploy_m4_social.sql`, transactional) already exists in the scratchpad, ready whenever the user wants to deploy.
  - **Follow-up 2026-08-21, from live user testing:** two issues reported. (1) `useCompleteSession` (`hooks/useWorkoutSession.ts`) invalidated streak/badges/personal-records on a completed session but never `active-challenges`, so progress only ever refreshed on some other trigger (e.g. an app reload) instead of right after finishing a workout — fixed by adding that invalidation, with a regression test (`Challenges.e2e.test.tsx`) that observes an actual refetch with updated progress, not just that `invalidateQueries` was called. (2) requested a "different screen for quest progression after finishing a workout" — rather than a new route, added a QUEST PROGRESS section to the existing post-workout `app/session/summary.tsx` (which already stacks GAINPOINTS/RECORDS/BADGES cards after a session), reusing the same `ChallengeCard` component from Add Workout (now exported from `ChallengesSection.tsx`) instead of duplicating the progress-bar visual.
  - **Follow-up 2026-08-22, explicit user request: switch from weekly to daily cadence.** `20260822000001_challenges_daily.sql` — rather than editing the already-committed/pushed `20260821000001_challenges.sql` in place, followed this session's standing pattern of redefining a function again in a later migration (same as `fn_complete_session`/`fn_check_badges`, each redefined 3+ times across migrations). `UPDATE`s the 3 existing `challenge_templates` rows' code/name/description/target/points for a single day instead of a week ("Get Moving" 3 sessions/150 GP → "Show Up" 1 session/50 GP; "Grind It Out" 20 sets/100 GP → 8 sets/50 GP; "Chase a Record" unchanged at target 1, points raised 100 → 75), and redefines `fn_active_challenges` so `v_period_start`/`v_period_end` are both `current_date` instead of the ISO week. Same server-clock-UTC-day (not per-user-local-timezone) simplification the weekly version used. 18 live-Postgres scenario tests (`test-epic7.js`, rewritten for the daily boundary — including a new explicit "yesterday's session doesn't count toward today" case). No client changes needed — all display copy comes from the DB, not hardcoded. Not yet deployed to production; added as migration #5 in `deploy_m4_social.sql`.
- **M5 (Polish), Story 1 — Onboarding: CODE DONE 2026-08-30, verified, NOT YET DEPLOYED to production.** Fetched the live Notion PRD (§10) to confirm M5's actual scope rather than assuming — "Onboarding, notifications, privacy settings, empty states, Pause Mode," exit criterion "new-user activation path completes with no dead ends." Pause Mode was already fully built during M3. User picked Onboarding via AskUserQuestion as the starting piece, since it's the one the exit criterion is actually about. No Figma frame exists for onboarding (§7.1 only reviewed Home/Add Workout/Achievements/Leaderboard), so this is a lean 3-step flow rather than a mockup translated 1:1, and every profile setting it touches (`unit_preference`, `weekly_goal_days`) already existed with a sensible default — no new settings, just a first-run confirmation of them.
  - `20260823000001_onboarding.sql`: adds a single nullable `profiles.onboarding_completed_at timestamptz` column — no new function, updatable directly through the existing `profiles_update_own` RLS policy, same pattern `unit_preference`/`weekly_goal_days` already use. Verified live against the test project under the actual `authenticated` role (not the superuser harness connection) — confirms a fresh profile defaults to `null` and a user can set their own flag, a genuine RLS check rather than the BYPASSRLS-blind kind flagged as a limitation in Story 3.
  - `app/onboarding.tsx` — 3 steps (Welcome → confirm units/weekly goal → "Build a routine" / "Quick start a workout" / "Skip"), every branch marks the flag and navigates somewhere real, so it can never be a dead end. "Build a routine" routes straight to the routine builder; "Quick start" and "Skip" land on Add Workout/Home respectively, reusing those screens' already-built entry points rather than duplicating any logging UI.
  - `app/_layout.tsx`'s root routing effect now also gates on `profiles.onboarding_completed_at`: a signed-in user with the flag unset is redirected to `/onboarding` from anywhere (not just right after sign-in, so a deep link or an app-reopen mid-flow can't skip it either), and finishing it redirects home. Existing test accounts from earlier in this session (and anyone already in production, if any of this ever ships) have `null` on this new column, so they'll see onboarding once too — correct behavior given nothing has reached production yet.
  - **Verification:** live-Postgres round-trip check (no scenario-test suite — there's no server-side logic beyond an existing RLS policy to exercise). 5 new Jest screen tests (`Onboarding.e2e.test.tsx`) covering every step transition and confirming each of the three end-of-flow actions both sets the flag and navigates to the right place. Full suite now 211 (up from 206). Typecheck clean.
  - **Not yet deployed to production, not pushed.**
- **Deployed to production 2026-08-30.** User confirmed running all three outstanding batches: `deploy_m4_social.sql` (Friends, Leaderboard, Social Feed, Challenges + daily-cadence, 5 migrations), `20260823000001_onboarding.sql`, and `20260824000001_drop_legacy_xp_system_fix.sql` (the corrected cutover — see the failed-deploy note on Epic 3 Story 3.3 above). All of M4 and M5 Story 1 are now live.
- **CRITICAL — P0 regression found by live user testing immediately after the above deploy: "did a leg exercise, did it again, didn't show the last one."** The always-visible last-time row (PRD §6.1.3: "This is the feature the product lives or dies on") reads `exercise_current_best.last_session_exercise_id` (`hooks/useLastSessionSets.ts`). `fn_complete_session` is supposed to stamp that pointer on every completion — that block existed from `20260814000005_exercise_current_best.sql` onward but was **silently dropped** when `fn_complete_session` was rewritten in `20260817000001_drop_legacy_xp_system.sql` (stripping old XP bookkeeping) and stayed missing through every redefinition since, including `20260820000001_social_feed.sql` and this session's own `20260824000001` cutover fix — all three carried the gap forward. No scenario test ever asserted on this specific column across the entire session, so nothing caught it until the user hit it live.
  - Reproduced directly against the test project before fixing: completing a session left `last_session_exercise_id` `null` (confirmed matches the reported bug exactly).
  - `20260825000001_restore_last_session_pointer.sql`: redefines `fn_complete_session` once more (identical body, `last defined 20260820000001_social_feed.sql`) with the stamping block restored in its original place/shape, plus a one-time idempotent backfill repairing any `exercise_current_best` row left stale since 2026-08-17 (same `DISTINCT ON` most-recent-session approach the original backfill used).
  - **Verification:** reproduced-then-fixed against the test project (pointer confirmed `null` before, correctly set after). New permanent regression suite `test-epic8.js` (5 scenario tests) — single completion stamps the pointer, the pointer advances across repeated sessions on the same exercise (the exact reported bug), and a session touching 2 exercises stamps both. No client changes needed (`useLastSessionSets.ts` was already correct — it was purely a server-side gap).
  - **This migration is the highest priority pending deploy** — the bug is live in production right now for every user until it runs.

## Requirements Inventory

### Functional Requirements

**Points (new `point_ledger`, replacing XP/Levels)**

FR1: Retire `xp_events`/`user_levels`/`level_thresholds` as the points source of truth; replace with a `point_ledger` table and GainPoints (GP) earning rules.
FR2: On session completion, server computes GP from: base session (50 GP for ≥1 completed working set or ≥10 min activity, 1/session) + strength volume (1 GP per 500kg volume load from working sets, capped 150 GP/session) + cardio/duration (1 GP per active minute, capped 120 GP/session) + personal record (100 GP per exercise setting a new e1RM record, capped at 3 PRs/session) + routine completion (25 GP for completing every planned exercise, 1/session).
FR3: Session-sourced GP is multiplied by a streak multiplier (1.0x @ 0-2 days, 1.1x @ 3-6 days, 1.25x @ 7-29 days, 1.4x @ 30+ days) before being recorded.
FR4: Session-sourced GP is capped at 400/calendar day; achievement-unlock GP is exempt from this ceiling.
FR5: All point calculation happens server-side; the client submits raw set data only, never a point total.
FR6: Every point award is recorded as an immutable `point_ledger` entry (source: base|volume|cardio|pr|routine|achievement, session_id, achievement_id, season_id, points, created_at). Lifetime and season totals are always derived by summing the ledger, never stored as a mutable counter.
FR7: A backfilled session (logged up to 7 days after the fact) earns GP at 50% and never retroactively repairs a broken streak.
FR8: A single-session load jump above 40% over an established exercise's history is accepted into the ledger but flagged excluded-pending-review (the exclusion is consumed by M4 leaderboards; M3 only needs to produce the flag).
FR9: Sessions under 60 seconds with fewer than two completed sets earn zero GP.
FR10: Deleting a session reverses its GP via a negative `point_ledger` entry and recalculates the streak for affected days.
FR11: Editing a completed session (within 48 hours) triggers GP recalculation.

**Streaks (replacing the existing simple model)**

FR12: A streak counts consecutive calendar days with at least one completed session.
FR13: Each user has a weekly rest allowance derived from their intended training frequency — `rest_allowance = 7 − training_days_per_week` (a new per-user setting, 1-7 days/week, default 4) — answering the PRD's own open question in §11 ("Should the rest allowance be a user setting or inferred from their routine's training days?") in favor of inference. A gap day automatically consumes an allowance and the streak continues; the allowance resets weekly and does not roll over. **[Revised 2026-08-14, user decision]** — originally specified as a flat default-2/configurable-1-4 setting; superseded by this derivation before Epic 2 implementation began. Pause Mode (FR18) is unrelated and unchanged — a separate, explicit, user-triggered hold for injury/illness/travel, not a weekly mechanic.
FR14: A Streak Freeze is earned at every 7 days of streak (maximum 2 banked); a freeze covers one missed day beyond the rest allowance, is consumed automatically, and is disclosed to the user the next time they open the app.
FR15: The streak breaks (resets to 0) when a day passes with no session, no remaining rest allowance, and no banked freeze.
FR16: The streak day boundary is local midnight with a grace window to 04:00 for late-night training; timezone changes never retroactively break a streak.
FR17: The personal-best streak length is permanent and always displayed (e.g. "Best: 23 days") alongside the current, possibly-reset counter.
FR18: A user can enable Pause Mode (up to 14 days per quarter) which holds the streak counter (no reset) and stops all streak notifications.
FR19: At most one streak-related reminder notification per day, timed to the user's historical training pattern; an "at risk" nudge fires only when the streak will actually break that night (allowance and freezes exhausted); no notification while Pause Mode is active or an injury is logged; no guilt-framed copy.

**Achievement Hall + Badges (replacing the existing catalogue)**

FR20: The Achievement Hall renders three sections: a streak header card (current streak, personal best, rest allowance remaining, freezes banked), lifetime totals (all-time GP, sessions completed, total volume lifted, PRs set, current season rank), and a badge grid.
FR21: The badge grid shows every badge in the catalogue, including locked ones — locked badges show name, requirement, and GP value with a lock icon; unlocked badges show the earn date and a checkmark.
FR22: Badge definitions (requirement, GP value, category, icon) live in server-side config/data, not client code, so the catalogue can be extended without an app release.
FR23: Retire the current 8-badge catalogue; ship the PRD's 10-badge v1.0 catalogue (§6.4: First Workout, Speed Demon, Iron Will, Century Club, Social Butterfly, Progressive Overload, Architect, Tonnage, Unbroken, Well Rounded) with matching criteria-evaluation logic. Note: "Social Butterfly" (add 5 friends) has a forward dependency on M4 (friends) — it exists in the catalogue as locked but cannot unlock until M4 ships. Accepted as a known gap for this milestone.
FR24: Badge unlock awards GP outside the daily point ceiling, via a `source: 'achievement'` point-ledger entry tagged with the achievement id.

### NonFunctional Requirements

NFR1: Point, streak, and badge computation is entirely server-side (Postgres functions/triggers), matching the existing `fn_process_logged_set`/`fn_complete_session` pattern — never trust a client-submitted total.
NFR2: Point and streak recalculation (session delete/edit, streak break) is exact and idempotent — replaying a session log must reconcile to the same state. This is the PRD's own M3 exit criterion (§10): "Points and streaks reconcile exactly against a replayed session log."
NFR3: Session completion remains a single round trip — extend the existing `fn_complete_session` RPC rather than introducing additional round trips.
NFR4: Badge definitions, point rates, and the streak multiplier table are stored as server-side config/data, tunable without an app release.

### Additional Requirements

- **[ASSUMPTION, confirmed 2026-08-14]** Clean cutover on `xp_events`/`user_levels`/`level_thresholds` — no live production user base yet, so no data-migration/backfill epic is needed. These tables and their reads/writes are retired, not migrated.
- `fn_complete_session` (supabase/migrations/20260811000008_functions_triggers.sql) is the highest-risk shared entry point — it must be redefined to call the new point/streak/badge logic instead of its current XP/level calls, while preserving its single-round-trip contract (NFR3).
- `hooks/__tests__/CompleteDiscardSession.e2e.test.tsx` asserts on the *current* RPC return shape (`xp_earned`, `leveled_up`, `new_level`). This test must be updated to the new GP-shaped return fields as part of the epic that redefines `fn_complete_session` — not left broken.
- Home's Streak stat tile (already visible in the current build) must read from the new streak model as part of M3, even though the rest of Home's restructure (per §6.5/§7.3) is M4/M5 scope.
- The `badges`/`user_badges` tables' structure (code, name, description, category, icon, criteria jsonb, points) is reusable as-is for the new catalogue — this is a re-seed + new criteria-evaluation logic, not a schema rebuild. The `badge_category` enum, however, does not match the PRD's categories (Onboarding, Cardio, Consistency, Volume, Social, Progression, Variety vs. existing strength/consistency/exploration/volume) and needs to change.

### UX Design Requirements

None — no separate UX design document exists for this project. The PRD's §7.1 (Achievement Hall verdict: "Ready — add the lifetime totals block from 6.4") and §7.2 (design system tokens) apply but were not broken into discrete UX-DR items, since no Figma export or design contract was available to extract against.

### FR Coverage Map

FR1–FR11: Epic 1 — points engine (`point_ledger`, GP earning rules, caps, backfill/edit/delete recalculation)
FR12–FR19: Epic 2 — streak engine (rest allowance, earned freezes, Pause Mode, notification policy)
FR20–FR24: Epic 3 — Achievement Hall & badges (hall UI, badge grid, v1.0 catalogue, criteria evaluation)
NFR1–NFR3: Epic 1 (first to redefine `fn_complete_session`; the recalculation/idempotency exit criterion is proven there and re-verified in Epics 2 and 3)
NFR4: Spans Epic 1, 2, and 3 (every domain's tunable values are server-side config/data)

## Epic List

### Epic 1: Earn GainPoints From Every Session
A lifter who finishes a workout sees fair, transparent GainPoints awarded — base + volume + cardio + PR + routine completion, streak-multiplied, sensibly capped — with a lifetime total that stays trustworthy through session edits, deletes, and backfills.
**FRs covered:** FR1–FR11 (+ NFR1, NFR2, NFR3, NFR4)

### Epic 2: Build and Protect a Training Streak
A consistency-focused user's streak survives planned rest days via a weekly allowance, earns freezes for unplanned gaps, can be paused guilt-free, and always shows a permanent best even after a break.
**FRs covered:** FR12–FR19 (+ NFR1, NFR4)

### Epic 3: Unlock Achievements in the Achievement Hall
A user opens the Achievement Hall and sees their identity in one place — streak, lifetime totals, and every badge (locked and unlocked) — evaluated automatically against the new v1.0 catalogue as they train.
**FRs covered:** FR20–FR24 (+ NFR4)

---

## Epic 1: Earn GainPoints From Every Session

A lifter who finishes a workout sees fair, transparent GainPoints awarded — base + volume + cardio + PR + routine completion, streak-multiplied, sensibly capped — with a lifetime total that stays trustworthy through session edits, deletes, and backfills. Replaces the XP/Level system (`xp_events`, `user_levels`, `level_thresholds`) as the points source of truth.

### Story 1.1: Award base, volume, and cardio session points into a new point ledger, retiring XP

As a lifter,
I want my finished workout to award GainPoints instead of XP,
So that my progress is measured in the currency the app actually shows me (Points, Rank, Streak — not a Level).

**Acceptance Criteria:**

**Given** a new `point_ledger` table (id, user_id, source, session_id, achievement_id, points, season_id, created_at)
**When** the migration runs
**Then** the table exists with a `source` check constraint limited to `base|volume|cardio|pr|routine|achievement`, and `season_id` is populated as a calendar-month string (e.g. `2026-08`) even though no season/leaderboard feature consumes it yet

**Given** `fn_complete_session` is redefined
**When** a session with ≥1 completed working set completes
**Then** it inserts a `source: 'base'` ledger entry of 50 points (once, regardless of set count)

**Given** the same session completion
**When** working-set volume (Σ weight×reps, warm-ups excluded) is computed
**Then** a `source: 'volume'` entry of `floor(volume / 500)` points is inserted, capped at 150

**Given** a session with logged cardio/duration activity
**When** it completes
**Then** a `source: 'cardio'` entry of 1 point per active minute is inserted, capped at 120

**Given** Home's stat tile (`app/(tabs)/home.tsx`) and the Achievements screen (`app/(tabs)/achievements/index.tsx`) already read `user_levels.total_xp`/`current_level` directly for live UI (`XpBar`, a "LEVEL N" label) — discovered during implementation, not caught at requirements time
**When** this story ships
**Then** it is strictly additive: the existing `xp_events`/`user_levels`/`level_thresholds` system, `fn_process_logged_set`'s per-set XP insert, and `fn_complete_session`'s existing session-completion XP insert are all left **completely unchanged and still running** — the new `point_ledger` inserts happen alongside them, not instead of them. Nothing currently on screen changes value or behavior. The hard cutover (drop old tables/functions, swap Home + Achievements to read GP, remove the now-redundant XP inserts) is Story 3.3's job, once Epics 1 and 2's data is live and the new Hall UI has somewhere to display it.

**Given** a malicious or buggy client
**When** it attempts to submit a point total directly (not via `fn_complete_session`)
**Then** there is no client-writable path to `point_ledger` — RLS permits `select` of own rows only, no client `insert`

### Story 1.2: Award PR and routine-completion points, apply the streak multiplier

As a lifter,
I want extra points for personal records and finishing my planned routine, scaled by my current streak,
So that consistency and progress compound instead of feeling flat.

**Acceptance Criteria:**

**Given** a session where 2 exercises set a new e1RM personal record
**When** the session completes
**Then** two `source: 'pr'` entries of 100 points each are inserted (using the existing `personal_records` rows already written for that session by M2's `fn_process_logged_set`)

**Given** a session where 5 exercises set new PRs
**When** the session completes
**Then** only 3 `source: 'pr'` entries (300 points) are inserted — the cap — not 5

**Given** a routine-based session where every planned exercise had at least one logged set
**When** it completes
**Then** a `source: 'routine'` entry of 25 points is inserted; a session missing a planned exercise, or a non-routine (quick-start) session, does not get this entry

**Given** the user's current streak length (read from the existing `streaks.current_streak_days` column — unchanged by this story; Epic 2 later extends how that column is maintained, not its meaning)
**When** the session's base+volume+cardio+pr+routine points are totaled
**Then** the total is multiplied by 1.0x (0-2 days), 1.1x (3-6), 1.25x (7-29), or 1.4x (30+) before being recorded as the final per-source entries for that session

### Story 1.3: Enforce the daily point ceiling and zero-point session guardrails

As a lifter,
I want the point system to resist trivial farming,
So that a leaderboard built on these points (M4) is worth winning.

**Acceptance Criteria:**

**Given** a user has already earned 380 session-sourced points today
**When** a session would award 50 more
**Then** only 20 points are actually recorded (clamped to the 400/day ceiling), not rejected outright

**Given** a user at the 400-point daily ceiling
**When** a badge unlocks and awards achievement points
**Then** the achievement points are recorded in full, unaffected by the session ceiling (source-scoped cap check, not a total-scoped one — this exemption must require no further changes when Epic 3 adds achievement awards)

**Given** a session lasting 45 seconds with 1 completed set
**When** it completes
**Then** zero point_ledger entries are inserted for it

**Given** a session lasting 45 seconds with 2 completed sets, or 90 seconds with 0 completed sets
**When** it completes
**Then** normal point rules apply (the 60-second/2-set guardrail is an AND of both thresholds, not either alone — each example clears exactly one threshold, which is enough to escape it) **[corrected 2026-08-15: the example values were swapped in the original wording — "45s+0 sets" would actually satisfy both thresholds and should stay trivial; verified against the shipped implementation, which was already correct]**

### Story 1.4: Discount backfilled sessions and flag implausible load jumps

As a product owner,
I want backfilled sessions and suspicious load jumps handled fairly,
So that points stay meaningful without punishing legitimate late logging.

**Acceptance Criteria:**

**Given** a session whose `local_date` is 3 days before the date it was actually logged (completed_at's date)
**When** points are calculated
**Then** every source's points for that session are halved (50%) before insertion

**Given** a backfilled session
**When** it completes
**Then** it does not repair a currently-broken streak, even if its `local_date` would otherwise fill the gap

**Given** a session logged 8+ days after its `local_date`
**When** it completes
**Then** it is still accepted and scored (the 7-day figure gates the 50% discount, not eligibility to log at all) — confirm this matches existing session-logging behavior and flag to the user if a hard cutoff is actually wanted

**Given** an exercise with an established history (≥3 prior sessions) and a new set whose weight exceeds the prior best by more than 40%
**When** the session completes
**Then** the resulting `point_ledger` entries for that session are still inserted at full value, but flagged (add an `excluded_from_ranking boolean default false` column, set `true` for this session's entries) for later M4 leaderboard exclusion

### Story 1.5: Reverse and recalculate points when a session is deleted or edited

As a lifter,
I want my point total to stay correct if I delete or fix a workout,
So that my lifetime GP is something I can trust.

**Acceptance Criteria:**

**Given** a completed session with recorded point_ledger entries
**When** the session is deleted
**Then** a negative `point_ledger` entry (or entries) is inserted reversing exactly the points that session awarded, and lifetime GP reflects the reversal immediately

**Given** a completed session edited within 48 hours of completion (e.g. a set's weight/reps corrected)
**When** the edit is saved
**Then** points are recalculated from scratch for that session (reverse the old entries, insert new ones reflecting the corrected data) — net lifetime GP change equals the difference, not a doubled award

**Given** a completed session older than 48 hours
**When** an edit is attempted
**Then** the edit either recalculates nothing (points stay as originally awarded) or is blocked — confirm which with the user before implementing; the PRD only specifies the 48h window for *triggering* recalculation, not the after-window behavior

**Note:** this story intentionally does not touch streak state — deleting/editing a session's effect on the streak is covered by Epic 2, Story 2.3, which has the rebuilt date-based streak model needed to do it correctly.

---

## Epic 2: Build and Protect a Training Streak

A consistency-focused user's streak survives planned rest days via a weekly allowance, earns freezes for unplanned gaps, can be paused guilt-free, and always shows a permanent best even after a break. Replaces the current single-freeze streak model.

### Story 2.1: Add a weekly rest allowance derived from training frequency, replacing the single-freeze model

As a consistency seeker,
I want my planned rest days — based on how often I actually intend to train — to not threaten my streak,
So that resting on the days I never intended to train doesn't feel like punishment.

**Acceptance Criteria:**

**Given** `profiles.weekly_goal_days` already exists (smallint, 1-7, default 3) with a fully-built settings screen (`app/(tabs)/settings/weekly-goal.tsx`, copy: "How many days a week do you want to train? This drives your streak...") — discovered during implementation; no new column or UI needed, this is exactly the "intended training days per week" setting
**When** this story ships
**Then** it adds no new profile column — `weekly_goal_days` is reused as-is

**Given** `streaks` gains `rest_used_this_week int not null default 0` (no separate `rest_allowance` column — it's derived, not stored, to avoid a second source of truth that could drift from `weekly_goal_days`)
**When** the weekly rest allowance is needed anywhere (streak update, later UI display)
**Then** it is computed as `7 - weekly_goal_days` (e.g. 4 goal days/week -> 3 rest days/week; 6 goal days/week -> 1 rest day/week)

**Given** a user whose goal is 4 days/week (rest_allowance = 3) and has used 0 rest days this week
**When** a calendar day passes with no completed session
**Then** `rest_used_this_week` increments to 1, `current_streak_days` is unchanged (not broken, not incremented)

**Given** a user who has already used their full derived allowance this week
**When** another consecutive gap day occurs (and no freeze is available — see Story 2.2)
**Then** the streak breaks per Story 2.3's break condition

**Given** a new calendar week begins (per the user's locale week start)
**When** the first session-check of that week runs
**Then** `rest_used_this_week` resets to 0 — unused allowance does not carry over

**Given** a user changes `training_days_per_week` mid-week (e.g. 4 -> 6, shrinking their allowance from 3 to 1)
**When** they have already used 2 rest days this week under the old allowance
**Then** they are not retroactively penalized this week — the new (lower) allowance applies starting next week, not by breaking a streak that was valid under the allowance in effect when the rest days were actually taken

### Story 2.2: Earn and bank Streak Freezes for gaps beyond the allowance

As a consistency seeker,
I want occasional bigger gaps (illness, travel) to not wipe out a long streak,
So that one bad week doesn't erase months of consistency.

**Acceptance Criteria:**

**Given** `streaks` gains `freezes_banked int not null default 0` (reusing/renaming the existing `streak_freezes_available` column rather than adding a duplicate)
**When** a user's `current_streak_days` reaches a multiple of 7
**Then** `freezes_banked` increments by 1, capped at 2 (no increment past the cap)

**Given** a user with the week's rest allowance already exhausted and ≥1 freeze banked
**When** another gap day occurs
**Then** `freezes_banked` decrements by 1, the streak continues uninterrupted, and the gap date is recorded (reuse `streak_freeze_used_dates`)

**Given** a freeze was consumed since the user's last app open
**When** they next open the app
**Then** they see a disclosure of the freeze consumption (date covered) — surfaced via existing UI patterns (e.g. a toast or Achievement Hall banner); exact placement is an implementation decision for Amelia, not specified further here

**Given** a user with 0 rest allowance remaining and 0 freezes banked
**When** a gap day occurs
**Then** neither this story's freeze logic nor Story 2.1's allowance logic prevents the break — falls through to Story 2.3

### Story 2.3: Break the streak correctly, keep personal best permanent, and recalculate on session delete/edit

As a lifter,
I want my streak to break only when I've genuinely stopped, and my best-ever streak to always be visible,
So that a bad stretch doesn't erase my sense of past consistency.

**Acceptance Criteria:**

**Given** a day passes with no completed session, no rest allowance remaining, and no banked freeze
**When** the next streak check runs (on next session completion or a scheduled check)
**Then** `current_streak_days` resets to 0

**Given** `current_streak_days` was 23 and just broke to 0
**When** the reset happens
**Then** `longest_streak_days` remains 23 (untouched by the reset) and is displayed as "Best: 23 days" wherever the current streak is shown

**Given** a user starts a new streak after a break
**When** they log a session
**Then** `current_streak_days` starts from 1 and can eventually exceed the old `longest_streak_days`, updating it only once it actually does

**Given** a completed session is deleted or edited (per Epic 1, Story 1.5)
**When** the deletion/edit changes which calendar days had a completed session
**Then** `current_streak_days`, `longest_streak_days`, `rest_used_this_week`, and `freezes_banked` are recalculated from the user's actual session history for the affected date range, not just patched by ±1 — this is the concrete implementation of NFR2's "exact, idempotent recalculation" for streaks

### Story 2.4: Keep the streak day boundary timezone-safe

As a lifter who trains late at night or travels,
I want my streak to use my actual local day, not the server's,
So that a late-night session or a timezone change doesn't unfairly break my streak.

**Acceptance Criteria:**

**Given** `fn_update_streak` currently uses `current_date` (server/UTC date) — a known gap flagged in the M1 README ("Known gaps / next steps")
**When** this story redefines it
**Then** it uses `workout_sessions.local_date` (already populated from the device's local date since M1) as the day-boundary source, not the server's date

**Given** a session logged at 1:30am device-local time
**When** the day boundary is evaluated
**Then** it counts toward the previous calendar day if before 4:00am local (the grace window), matching the PRD's late-night-training accommodation

**Given** a user flies across timezones between two sessions
**When** their streak is next evaluated
**Then** the timezone shift itself never breaks the streak — only an actual missed local day (per Story 2.3) does

### Story 2.5: Add Pause Mode to hold the streak without penalty

As a lifter dealing with injury, illness, or travel,
I want to pause my streak instead of losing it,
So that GainQuest never pressures me to train while I shouldn't.

**Confirmed 2026-08-14, unchanged from the original PRD spec**: Pause Mode is explicit and user-triggered, separate from Story 2.1's weekly rest allowance — the two are not the same mechanic and don't share state.

**Acceptance Criteria:**

**Given** `streaks` gains a `paused_until date` column and a way to track quarterly pause-days used (e.g. `pause_days_used_this_quarter int not null default 0`)
**When** a user enables Pause Mode for N days
**Then** `paused_until` is set, and `current_streak_days` neither increments nor breaks for any day within the paused window, regardless of session activity

**Given** a user has already used 10 pause-days this quarter
**When** they request an 8-day pause
**Then** the request is clamped to the 4 remaining days, not rejected **[decided 2026-08-14: clamp, not reject — never blocks the user outright, consistent with every other wellbeing mechanic in this epic]**

**Given** Pause Mode is active
**When** any streak-related notification would otherwise fire (Story 2.6)
**Then** it is suppressed entirely for the duration of the pause

**Given** a paused window ends
**When** the user resumes normal activity
**Then** streak evaluation resumes exactly where it left off — the pause neither advances nor breaks the streak, it's a true hold

**Given** an active Pause Mode window
**When** the user chooses to end it early
**Then** `paused_until`/`pause_started_at` are cleared immediately and streak evaluation resumes right away — the pause-days already spent this quarter are not refunded **[added 2026-08-15: found missing during manual production testing — the original AC only covered enabling a pause and it expiring naturally; a real user who over-requested days, or recovered sooner than expected, needs a way out rather than waiting out the window. `fn_cancel_pause_mode` + an "End Pause Mode" button on the Pause Mode settings screen.]**

### Story 2.6: Send streak reminder and at-risk notifications, respectfully

As a lifter,
I want a nudge only when it actually matters,
So that GainQuest doesn't nag me.

**Acceptance Criteria:**

**Given** a user's historical training pattern (e.g. most common time-of-day they log a session)
**When** a day passes without a session logged yet
**Then** at most one reminder notification fires that day, timed near their historical pattern (reusing M1's existing `expo-notifications` local-notification infrastructure)

**Given** a day where the user still has rest allowance or a banked freeze remaining
**When** evening arrives with no session logged
**Then** no "at risk" nudge fires — only a day where allowance AND freezes are both exhausted, and no session yet logged, triggers the at-risk nudge

**Given** Pause Mode is active
**When** any streak notification would otherwise fire
**Then** it is suppressed **["logged an injury" dropped from this AC 2026-08-14 — confirmed no such flag/feature exists anywhere in the app; not invented for this story]**

**Given** any streak notification copy
**When** it is written
**Then** it contains no guilt-framing language (e.g. no "you're losing your streak!" — matches the PRD's explicit wellbeing requirement)

---

## Epic 3: Unlock Achievements in the Achievement Hall

A user opens the Achievement Hall and sees their identity in one place — streak, lifetime totals, and every badge (locked and unlocked) — evaluated automatically against the new v1.0 catalogue as they train. Replaces the current 8-badge catalogue.

### Story 3.1: Re-seed the badge catalogue with the v1.0 list and new categories

As a product owner,
I want the badge catalogue to match the rebrand PRD exactly,
So that the Achievement Hall reflects the actual reward system, not the old one.

**Acceptance Criteria:**

**Given** the existing `badge_category` enum (`strength`, `consistency`, `exploration`, `volume`)
**When** this migration runs
**Then** it is replaced with the PRD's categories (`onboarding`, `cardio`, `consistency`, `volume`, `social`, `progression`, `variety`)

**Given** the 8 existing badge rows and any `user_badges` referencing them
**When** this migration runs
**Then** they are deleted (clean cutover, per the confirmed no-production-users assumption) and replaced with exactly the 10 PRD v1.0 badges (First Workout, Speed Demon, Iron Will, Century Club, Social Butterfly, Progressive Overload, Architect, Tonnage, Unbroken, Well Rounded), each with the correct category, icon, GP value, and a machine-readable `criteria` jsonb matching its PRD requirement

**Given** the re-seeded catalogue
**When** queried
**Then** every badge's `points` value matches PRD §6.4 exactly (e.g. First Workout 500, Speed Demon 1000, Tonnage 2500)

### Story 3.2: Evaluate the new badge criteria types on session completion

As a lifter,
I want badges to unlock automatically the moment I earn them,
So that the achievement feels tied to the actual accomplishment.

**Acceptance Criteria:**

**Given** `fn_check_badges`' existing 4 criteria types (`streak_days`, `exercise_count_created`, `session_count`, `max_weight_for_exercise`)
**When** this story adds new types for the v1.0 catalogue
**Then** it recognizes and correctly evaluates: `est_1rm_beaten_consecutive_sessions` (Progressive Overload: 3 sessions running), `cumulative_volume_kg` (Tonnage: 100,000kg), `custom_routine_completions` (Architect: 5 completions of a custom routine), `distinct_workout_types_in_week` (Well Rounded: 4 types in one week), and `cardio_time_for_distance` (Speed Demon: 5km under 25 minutes)

**Given** a fixture session history where a user has beaten their e1RM on the same exercise in 3 consecutive sessions
**When** badges are checked after the 3rd session
**Then** Progressive Overload unlocks with a `source: 'achievement'` point_ledger entry (wired in Story 3.5)

**Given** the "Social Butterfly" badge (criteria type `friend_count`, requires 5 friends — an M4/friends-system feature that doesn't exist yet)
**When** badge checks run for any user
**Then** it never unlocks and never errors — its criteria type is recognized but always evaluates to `false` until M4 ships the friends system

### Story 3.3: Show the Achievement Hall's streak header and lifetime totals

As a lifter,
I want to see my whole training identity in one screen,
So that my progress feels consolidated, not scattered.

**Acceptance Criteria:**

**Given** the existing `app/(tabs)/achievements/index.tsx` screen (built in M1, currently showing the old data shape)
**When** updated for this story
**Then** its streak header card shows current streak, personal best, rest allowance remaining, and freezes banked — sourced from Epic 2's streak model

**Given** the same screen
**When** rendering lifetime totals
**Then** it shows all-time GP (summed from `point_ledger`, Epic 1), sessions completed, total volume lifted, and PRs set — each matching the user's actual data exactly

**Given** "current season rank" (a stat tile listed in the PRD's Achievement Hall spec but dependent on M4's seasonal leaderboards, which don't exist yet)
**When** the Hall renders
**Then** it shows a graceful placeholder (e.g. "—" or "Coming soon"), never an error, a fake number, or a crash

**Given** this story's new GP/streak-based Hall display now has somewhere to show the data Epic 1 Story 1.1 deferred (added 2026-08-14: the hard cutover deferred from Story 1.1, since Home/Achievements previously had no GP UI to switch to)
**When** this story ships
**Then** it also: (a) updates `app/(tabs)/home.tsx`'s "Points" stat tile and removes `XpBar` in favor of the new lifetime-GP display, (b) removes the session-completion XP insert in `fn_complete_session` and the per-set XP insert in `fn_process_logged_set` (both now fully superseded by `point_ledger`), (c) drops `xp_events`, `user_levels`, `level_thresholds`, `fn_calculate_set_xp`, and `fn_update_user_level`, and (d) removes the `user_levels` bootstrap insert from `handle_new_user()`
**And** this is the *last possible moment* to do this safely — it must not ship before Epic 1 and Epic 2's data is verified live and correct, since there is no going back to the old numbers once the old tables are dropped

### Story 3.4: Show the badge grid with locked and unlocked states

As a lifter,
I want to see every badge, including ones I haven't earned yet,
So that I know what to work toward.

**Acceptance Criteria:**

**Given** a freshly-seeded user with no unlocked badges
**When** they open the Achievement Hall
**Then** all 10 badges render in locked state: name, requirement description, GP value, and a lock icon

**Given** a user unlocks "First Workout" (Story 3.2's evaluation)
**When** they next view the Hall
**Then** that badge renders unlocked: earn date and a checkmark, while the other 9 remain locked

**Given** the grid's data source
**When** rendering
**Then** it reads directly from `badges` + `user_badges` (per-user join), not a hardcoded client list — matching NFR4's config-driven requirement

### Story 3.5: Award achievement GP outside the daily point ceiling

As a lifter,
I want a badge unlock to always pay out in full,
So that hitting a big milestone isn't quietly capped away.

**Acceptance Criteria:**

**Given** `fn_check_badges` unlocks a badge
**When** it does
**Then** it inserts a `source: 'achievement'` `point_ledger` entry equal to that badge's `points` value, tagged with the badge's id in `achievement_id`

**Given** a user already at the 400 GP daily session-ceiling (Epic 1, Story 1.3)
**When** a badge unlocks that same day
**Then** the full achievement GP is still awarded — Story 1.3's cap check is already source-scoped, so no changes to that logic are needed here, only confirmation via a test that achievement GP is unaffected

**Given** a badge unlock
**When** the achievement GP is recorded
**Then** the user's lifetime GP total (Story 3.3's display) reflects it immediately, in the same round trip as the session completion that triggered the unlock

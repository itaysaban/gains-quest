---
stepsCompleted: [1, 2, 3]
inputDocuments: ["notion:PRD: GainQuest — Gamified Training Rebrand (v1.0) (https://app.notion.com/p/3bb45eeb2b0d80ea9764cf06941df14e)", "supabase/migrations/20260811000006_gamification.sql", "supabase/migrations/20260813000001_badge_points.sql", "supabase/migrations/20260811000008_functions_triggers.sql"]
milestoneScope: "M3 — Game layer only (per PRD §10). M1/M2 already shipped. M4/M5 out of scope."
---

# GainQuest - Epic Breakdown (M3 — Game Layer)

## Overview

This document provides the epic and story breakdown for GainQuest's **M3 milestone only** — the game layer (point ledger, streaks with allowance and freezes, Achievement Hall, badge engine) — decomposed from the PRD hosted in Notion ("PRD: GainQuest — Gamified Training Rebrand (v1.0)"). No separate Architecture.md or UX design document exists for this project; the PRD's own §7 (design spec) and §8 (data model) serve that role, supplemented by direct inspection of the already-shipped Supabase schema (M1/M2).

**Load-bearing discovery from requirements extraction:** M3 is not greenfield. `supabase/migrations/20260811000006_gamification.sql` and `20260813000001_badge_points.sql` already implement a working XP/Level/Streak/Badge system, wired into `fn_complete_session` (M1/M2's session-completion RPC). That system uses a materially different model than this PRD (XP+Levels vs. GainPoints-only; a simple 1-freeze streak vs. rest-allowance + earned-freeze; an 8-badge catalogue vs. the PRD's 10). Per user decision (2026-08-14): **full replace** — retire the XP/Level system and the old streak/badge logic, build the PRD's model as their direct replacement, with a clean cutover (no production user data to migrate, per assumption confirmed at requirements-gathering).

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
FR13: Each user has a configurable weekly rest allowance (default 2, range 1-4); a gap day automatically consumes an allowance and the streak continues; the allowance resets weekly and does not roll over.
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

**Given** the redefined function
**When** session completion runs
**Then** it no longer inserts into `xp_events`, and the `xp_events`, `user_levels`, `level_thresholds` tables and their trigger (`fn_update_user_level`) are dropped in this same migration

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

**Given** a session lasting 45 seconds with 0 completed sets, or 90 seconds with 2 completed sets
**When** it completes
**Then** normal point rules apply (the 60-second/2-set guardrail is an AND of both thresholds, not either alone)

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

### Story 2.1: Add a weekly rest allowance, replacing the single-freeze model

As a consistency seeker,
I want planned rest days to not threaten my streak,
So that resting doesn't feel like punishment.

**Acceptance Criteria:**

**Given** the `streaks` table
**When** this migration runs
**Then** it gains `rest_allowance int not null default 2` (user-configurable 1-4) and `rest_used_this_week int not null default 0`

**Given** a user with the default allowance (2) who has used 0 this week
**When** a calendar day passes with no completed session
**Then** `rest_used_this_week` increments to 1, `current_streak_days` is unchanged (not broken, not incremented)

**Given** a user who has already used both rest days this week
**When** a third consecutive gap day occurs (and no freeze is available — see Story 2.2)
**Then** the streak breaks per Story 2.3's break condition

**Given** a new calendar week begins (per the user's locale week start)
**When** the first session-check of that week runs
**Then** `rest_used_this_week` resets to 0 — unused allowance does not carry over

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

**Acceptance Criteria:**

**Given** `streaks` gains a `paused_until date` column and a way to track quarterly pause-days used (e.g. `pause_days_used_this_quarter int not null default 0`)
**When** a user enables Pause Mode for N days
**Then** `paused_until` is set, and `current_streak_days` neither increments nor breaks for any day within the paused window, regardless of session activity

**Given** a user has already used 10 pause-days this quarter
**When** they request an 8-day pause
**Then** the request is rejected or clamped to 4 remaining days — confirm which behavior with the user; the PRD specifies the 14-day/quarter cap but not the over-request behavior

**Given** Pause Mode is active
**When** any streak-related notification would otherwise fire (Story 2.6)
**Then** it is suppressed entirely for the duration of the pause

**Given** a paused window ends
**When** the user resumes normal activity
**Then** streak evaluation resumes exactly where it left off — the pause neither advances nor breaks the streak, it's a true hold

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

**Given** Pause Mode is active, or the user has logged an injury (existing profile/settings flag if present, otherwise treat as an assumption to confirm)
**When** any streak notification would otherwise fire
**Then** it is suppressed

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

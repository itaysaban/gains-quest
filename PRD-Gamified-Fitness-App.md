# Product Requirements Document

## Gamified Custom Workout & Strength Tracking App

**Version:** 0.1 (Draft)
**Owner:** [Product Owner]
**Status:** For review

---

## 1. Vision & Problem Statement

Most workout trackers force users into rigid, pre-built exercise libraries and treat logging as a chore. Our app lets users **build their own exercises**, log weights/reps with minimal friction, and turns the process of getting stronger into a **visible, rewarding progression system** — the way an RPG makes grinding feel meaningful instead of tedious.

**Core loop:** Build/select exercise → Log a set → See progress & feedback → Get rewarded → Come back tomorrow.

---

## 2. Target User & Core Value Prop

| User                          | Need                                      | Value Delivered              |
| ----------------------------- | ----------------------------------------- | ---------------------------- |
| Gym-goer with unique routines | Track exercises not found in generic apps | Full custom exercise builder |
| Data-driven lifter            | See strength trends over time             | Charts, PRs, volume tracking |
| Casual/beginner               | Stay motivated & consistent               | XP, streaks, levels, badges  |

---

## 3. Information Architecture (Top-Level Screens)

1. **Home / Dashboard** – today's plan, streak, XP bar, quick-log
2. **Exercise Library** – built-in + custom exercises
3. **Workout Session (Active Logging)**
4. **Progress & Analytics**
5. **Profile & Achievements**
6. **Settings**

---

## 4. Detailed Feature Specification (Every Action)

### 4.1 Exercise Management

| Action                              | Description                                                                                                                                                                                                                                                                                 | Details / Edge Cases                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Create custom exercise**          | User taps "+ New Exercise," names it, selects category (e.g., Push, Pull, Legs, Core, Cardio), selects primary muscle group(s), selects equipment type (barbell, dumbbell, machine, bodyweight, cable, band), and chooses tracking type (weight×reps, time, distance, bodyweight-reps-only) | Name must be unique per user; duplicate warning suggests merging with existing exercise |
| **Edit exercise**                   | Modify name, category, muscle group, icon/color                                                                                                                                                                                                                                             | Editing doesn't break historical logs (logs reference exercise ID, not name string)     |
| **Duplicate/clone exercise**        | Copy an existing exercise as a starting template (e.g., "Incline Bench" from "Bench Press")                                                                                                                                                                                                 | Useful for variations (grip, angle, tempo)                                              |
| **Archive/delete exercise**         | Soft-delete; hidden from picker but history preserved                                                                                                                                                                                                                                       | Hard delete only if zero logs exist, with confirmation modal                            |
| **Favorite/pin exercise**           | Star an exercise for quick access                                                                                                                                                                                                                                                           | Pinned exercises surface at top of picker and Home quick-log                            |
| **Attach custom fields**            | Add optional per-exercise metadata (e.g., band color, machine pin number, incline angle, RPE)                                                                                                                                                                                               | Stored as key-value; shown in log entry form when present                               |
| **Add exercise notes/instructions** | Free text or optional short video/photo attachment (form cue reminder)                                                                                                                                                                                                                      | Local media storage; optional                                                           |
| **Search/filter exercise library**  | Search by name; filter by category, muscle group, equipment, "custom only"                                                                                                                                                                                                                  | Instant search-as-you-type                                                              |

### 4.2 Workout / Routine Building

| Action                           | Description                                                      | Details                                                                   |
| -------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Create a routine (template)**  | Group exercises into a reusable workout (e.g., "Push Day A")     | Ordered list; supports supersets (grouped exercises with no rest between) |
| **Add exercise to routine**      | Pick from library, set target sets/reps/weight as a plan         | Optional — user can also log freestyle without a routine                  |
| **Reorder exercises in routine** | Drag-and-drop reordering                                         | —                                                                         |
| **Set rest timer per exercise**  | Default or custom rest duration                                  | Auto-starts after a set is logged                                         |
| **Duplicate routine**            | Clone for progressive variations (e.g., Week 2 version)          | —                                                                         |
| **Schedule routine**             | Assign routine(s) to days of the week / a rotation (A/B/C split) | Push notification reminder on scheduled day                               |
| **Delete/archive routine**       | Soft delete, history retained                                    | —                                                                         |

### 4.3 Active Workout Session (Core Logging Loop)

| Action                                                 | Description                                                      | Details                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Start workout session**                              | From a routine or "Start Empty Workout"                          | Session timer begins                                                                      |
| **Log a set**                                          | Enter weight + reps (or time/distance for cardio); tap "Log Set" | Auto-suggests weight/reps based on last session for that exercise ("last time: 60kg x 8") |
| **Quick +/- weight & rep adjusters**                   | Increment/decrement buttons next to numeric input                | Reduces typing during a workout                                                           |
| **Mark set as warm-up / working / drop set / failure** | Tag each set's type                                              | Affects volume calculations and analytics (warm-ups excluded from PR/volume stats)        |
| **Log RPE / RIR (optional)**                           | Rate of Perceived Exertion or Reps-in-Reserve slider             | Feeds intensity analytics                                                                 |
| **Rest timer auto-start**                              | Countdown after logging a set, with notification when done       | Adjustable mid-countdown                                                                  |
| **Edit/delete a logged set**                           | Fix mistakes mid- or post-session                                | —                                                                                         |
| **Add exercise mid-session**                           | Insert an unplanned exercise into current session                | —                                                                                         |
| **Superset/circuit mode**                              | Log multiple exercises back-to-back under one rest clock         | —                                                                                         |
| **Pause / resume session**                             | Handles interruptions (phone call, gym busy)                     | Session timer pauses                                                                      |
| **Finish workout**                                     | Ends session, triggers summary screen                            | Shows duration, total volume, sets, XP earned, PRs hit                                    |
| **Add session notes**                                  | Free text ("felt strong today," "shoulder tweak")                | Attached to session record                                                                |
| **Discard workout**                                    | Cancel an accidental/empty session                               | Confirmation required                                                                     |

### 4.4 Progress Tracking & Analytics

| Action                              | Description                                                                                    | Details                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **View exercise history**           | Per-exercise log of every past set/session                                                     | Sortable by date                                                  |
| **View strength progression chart** | Line chart of weight/volume/est. 1RM over time                                                 | Toggle metric: max weight, est. 1RM (Epley formula), total volume |
| **View personal records (PRs)**     | Auto-detected: heaviest weight, best reps at a weight, best est. 1RM, best volume in a session | Celebrated with an in-app animation/toast                         |
| **Body measurement tracking**       | Optional log of bodyweight, body fat %, circumference measurements                             | Separate from lifting data; own chart                             |
| **Workout calendar/heatmap**        | Visual calendar showing workout frequency (GitHub-style heatmap)                               | Tapping a day opens that session                                  |
| **Volume & frequency dashboard**    | Weekly/monthly total volume per muscle group                                                   | Highlights under-trained muscle groups                            |
| **Export data**                     | CSV/PDF export of logs                                                                         | For backup or sharing with a coach                                |

### 4.5 Gamification Layer

| Action                              | Description                                                                                                                          | Details                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **XP system**                       | Every logged set/session earns XP                                                                                                    | XP scaled by volume, consistency, and effort (RPE) — not just raw weight, so all fitness levels progress fairly |
| **Level up**                        | Cumulative XP unlocks user levels                                                                                                    | Level reflects "training experience," not just strength, to stay inclusive                                      |
| **Streaks**                         | Consecutive days/weeks with a completed workout                                                                                      | Streak freeze/grace-day item to protect against one missed day (prevents demotivating streak loss)              |
| **Achievements/badges**             | Milestone-based unlocks: "First 100kg Squat," "30-Day Streak," "Tried 10 Custom Exercises," "Consistency King (4x/week for a month)" | Categorized: Strength, Consistency, Exploration, Volume                                                         |
| **PR celebrations**                 | Confetti/animation + shareable card when a PR is hit                                                                                 | Encourages social sharing (external, opt-in)                                                                    |
| **Quests/challenges**               | Weekly optional challenges (e.g., "Log 3 leg days this week," "Beat last week's total volume")                                       | Soft-push notifications, not punitive                                                                           |
| **Avatar/profile customization**    | Cosmetic unlocks (icons, themes, badges displayed on profile) earned via XP/achievements                                             | Non-pay-to-win — cosmetic only                                                                                  |
| **Leaderboards (optional, opt-in)** | Compare streaks/volume with friends                                                                                                  | Privacy-first: opt-in, friends-only by default                                                                  |
| **Progress milestones bar**         | Visual "next reward at X XP" progress bar on Home                                                                                    | Keeps near-term goals visible                                                                                   |

### 4.6 Social (Optional Phase 2)

| Action                          | Description                      |
| ------------------------------- | -------------------------------- |
| **Add friends / follow**        | Connect with other users         |
| **Share PR or workout summary** | Generates a shareable image card |
| **Group challenges**            | Compete on a shared quest        |

### 4.7 Account & Settings

| Action                       | Description                                         |
| ---------------------------- | --------------------------------------------------- |
| **Sign up / log in**         | Email, Apple/Google SSO                             |
| **Set units**                | kg/lb toggle, global or per-exercise                |
| **Set weekly goal**          | Target workout frequency, drives streak/quest logic |
| **Notification preferences** | Rest timer alerts, reminders, streak warnings       |
| **Data backup/sync**         | Cloud sync across devices                           |
| **Privacy controls**         | Manage what's visible to friends/leaderboard        |

---

## 5. Gamification Design Principles (Why It Works)

1. **Effort-relative rewards, not absolute** — a beginner's XP curve should feel as rewarding as an advanced lifter's, since it's normalized to their own baseline (progressive overload relative to self).
2. **Loss-aversion used gently** — streaks motivate via "protect what you built" (with a forgiving streak-freeze), not punishing shame mechanics.
3. **Variable, meaningful rewards** — PRs and badges are earned unpredictably (you don't always know a PR is coming), which is more motivating than fixed schedules.
4. **Visible mastery curve** — charts + levels give users a tangible sense of "I am becoming a different, stronger person," tying into identity-based habit formation.
5. **Cosmetic-only monetization/rewards** — never gate performance-relevant features behind gamified rewards, to keep trust intact.

---

## 6. MVP Scope (Phase 1 — build this first)

- [ ] Custom exercise creation (4.1: create, edit, delete, favorite)
- [ ] Basic routine builder (4.2: create, add exercises, reorder)
- [ ] Active session logging (4.3: log set, edit set, rest timer, finish workout)
- [ ] History + strength chart + PR detection (4.4)
- [ ] XP, levels, streaks, basic badges (4.5 core loop only — no social)

**Explicitly out of scope for MVP:** social/leaderboards, avatar customization, quests, data export.

---

## 7. Open Questions

1. Should XP be visible in real-time during a workout, or only in the post-session summary (to avoid distraction mid-lift)?
2. Do we support supersets/circuits in MVP or Phase 2?
3. What's the streak-freeze economy — earned via XP, limited per month, or purchasable?
4. Offline-first requirement for gym use with poor signal?

---

## 8. Success Metrics

- D1/D7/D30 retention
- Avg. sessions logged per active user per week
- % of users who create at least 1 custom exercise
- Streak length distribution
- XP-to-retention correlation (validate gamification is actually driving return visits, not just decoration)

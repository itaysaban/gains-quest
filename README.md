# GainQuest

A training app where the game *is* the training log: build a routine, log a session with last-time data in front of you, beat a number, and watch points/streaks/achievements react. Rebranded from the original GainsQuest MVP per `PRD-GainQuest-Rebrand-v1.0.md` — this build covers **M1 (Engine)** and **M2 (Progression)**; points economy/streak rules, friends/leaderboards, and the social feed (M3–M5) are deferred to future passes.

Built with **Expo Router** (React Native, TypeScript) and **Supabase** (Postgres + Auth). See `PRD-Gamified-Fitness-App.md` (original MVP) and the GainQuest rebrand PRD for the full product spec.

## 1. Prerequisites

- Node.js 20.19+ or 22.13+ (Expo SDK 54 / React Native 0.81 require this; older 20.x works for `npm install` but may warn)
- [Expo Go](https://expo.dev/go) on your phone, or an iOS/Android simulator — **Expo Go on the app store only supports the current SDK** (54 as of this build); if a newer SDK ships, either stay pinned to 54 or rebuild your own Expo Go via `eas go`
- A free [Supabase](https://supabase.com) account

## 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com/dashboard).
2. In **Project Settings → API**, copy the **Project URL** and **anon public key**.
3. Copy `.env.example` to `.env` and fill in those two values (the URL is just `https://your-project-ref.supabase.co` — no `/rest/v1/` suffix):
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Run the database migrations, **in order**, via the Supabase Dashboard **SQL Editor** (or `npx supabase db push` with the CLI):
   - `supabase/migrations/*.sql` — every file, in filename order (they're timestamp-prefixed)
   - `supabase/seed.sql` — level thresholds, badge catalogue, ~19 starter exercises
   - `supabase/seed_exercises.sql` — ~130 additional exercises across every category/equipment combo (run after `seed.sql`)

   If you already ran the earlier migrations (up through `20260813000001_badge_points.sql`) against a live project, you only need to run the newer ones on top: `20260814000001` through `20260814000005`, then `seed_exercises.sql`.
5. Enable **Email** auth: **Authentication → Providers → Email** (on by default). This is the only auth method guaranteed to work without extra setup.
6. (Optional, for social sign-in) Enable **Google** / **Apple** under **Authentication → Providers** and add your own OAuth app credentials — the app's `expo-auth-session` flow is wired up but needs your credentials to actually work.
7. Create a **Storage** bucket named `exercise-photos`, set to **private**, for exercise form-cue photos. Add a policy restricting access to `auth.uid() = (storage.foldername(name))[1]::uuid` for select/insert/update/delete.

## 3. Run the app

```bash
npm install
npm start
```

Then either:
- Scan the QR code with **Expo Go** on your phone (full-fidelity — required to test notifications, haptics, and the native share sheet), or
- Press `w` for a web preview (`npm run web`) — fastest for iterating on forms, lists, and charts, but notifications/haptics are no-ops on web.

## 4. Project structure

```
app/                        Expo Router screens (file-based routing)
  (auth)/                   sign-in, sign-up, forgot-password
  (tabs)/                   4-tab bar: home, add-workout, achievements, leaderboard
    add-workout/            routine launcher (today's routine, my routines, quick-start) + routines/ subtree
    library/, progress/,    reachable but hidden from the tab bar (href: null) — via Add Workout's
      settings/             "Manage Exercises", the Achievements header avatar/progress link
  session/                  active workout logging + finish summary (full-screen modals)
components/                 UI primitives + feature components, grouped by domain
hooks/                      React Query hooks wrapping Supabase (one file per feature area)
lib/                        Supabase client, React Query client, mutation-resume registry, auth, utils
store/                      zustand session store (in-progress workout + timers, persisted)
types/                      hand-written Supabase types + friendlier domain aliases
supabase/migrations/        SQL schema, RLS policies, and Postgres functions (numbered, run in order)
supabase/seed.sql           level thresholds, badges, starter exercises
supabase/seed_exercises.sql expanded exercise library (~130 more, run after seed.sql)
```

## 5. The core engine (M1 + M2)

**Active session logging** (`app/session/active.tsx`, `components/session/*`) is the centerpiece:
- The last-time row (`LastSessionRow.tsx`) is always visible per exercise, sourced from `exercise_current_best.last_session_exercise_id` — a pointer maintained by `fn_complete_session`, so it's one indexed lookup, never a history scan.
- `DraftSetRow.tsx` pre-fills from the matching set in your last session and logs on a single tap of the checkbox.
- PR detection is authoritative server-side (`fn_process_logged_set`, same trigger pattern as before), but the client also computes an **instant, optimistic** PR check (`hooks/useLoggedSets.ts`'s `onMutate`) against the prefetched `exercise_current_best` cache, so the trophy badge and toast (`PrBadge.tsx`) appear immediately instead of waiting on a round trip. The server always has the final say on reconciliation.
- Progressive overload suggestions (`ProgressionChip.tsx` / `hooks/useProgressionSuggestion.ts`) are advisory only — tapping pre-fills the next set's weight, never auto-logs.

**Local-first / offline resilience**: every set's `id` is generated client-side (`lib/utils/uuid.ts`) so writes are idempotent upserts, safe to retry after a resume. `lib/registerMutationDefaults.ts` registers the mutations that must survive an app kill; `app/_layout.tsx` calls `queryClient.resumePausedMutations()` once the persisted cache restores on cold boot.

## 6. Testing & typechecking

```bash
npm run typecheck   # tsc --noEmit across the whole app
npm test            # Jest unit tests for the gamification formulas and pure helpers
```

## 7. Known gaps / next steps

- **M3 (Points economy, streak rest-allowance/freezes/Pause Mode)**, **M4 (friends, seasonal tiered leaderboards, social feed)**, and **M5 (onboarding polish)** are the PRD's remaining milestones, not built in this pass. The Leaderboard tab is a placeholder.
- **Streak day-boundary**: `workout_sessions.local_date` is now populated from the device's local date, but `fn_update_streak` still uses the server's `current_date` — rewiring the streak function to use `local_date` is bundled with the M3 work, not this pass.
- **Deload progression check** only looks back 2 sessions via an on-demand query (not cached) — fine for advisory UX, not meant to be a hot path.
- **Remote push notifications** need an [EAS development build](https://docs.expo.dev/develop/development-builds/introduction/) — Expo Go only supports local notifications (rest timer, in-app alerts), which work out of the box.
- **Rotation-style routine scheduling** (A/B/C split) has full data-layer support but no dedicated setup screen — only fixed days-of-week scheduling is exposed in the UI.
- Google/Apple OAuth sign-in is wired up but requires your own provider credentials in the Supabase dashboard.

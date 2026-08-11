# GainsQuest

A gamified custom workout & strength-tracking app. Build your own exercises, log sets with minimal friction, and turn getting stronger into a visible, rewarding progression system (XP, levels, streaks, badges, PRs).

Built with **Expo Router** (React Native, TypeScript) and **Supabase** (Postgres + Auth). See `PRD-Gamified-Fitness-App.md` for the full product spec.

## 1. Prerequisites

- Node.js 20.19+ or 22.13+ (Expo SDK 57 / React Native 0.86 require this; older 20.x works for `npm install` but may warn)
- [Expo Go](https://expo.dev/go) on your phone, or an iOS/Android simulator
- A free [Supabase](https://supabase.com) account

## 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com/dashboard).
2. In **Project Settings → API**, copy the **Project URL** and **anon public key**.
3. Copy `.env.example` to `.env` and fill in those two values:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Run the database migrations. Easiest path — open the Supabase Dashboard **SQL Editor** and run each file in `supabase/migrations/` **in order** (they're numbered), then run `supabase/seed.sql` last. Or, with the [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   psql "<connection-string>" -f supabase/seed.sql   # or paste seed.sql into the SQL Editor
   ```
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
app/                     Expo Router screens (file-based routing)
  (auth)/                sign-in, sign-up, forgot-password
  (tabs)/                home, library, routines, progress, profile, settings
  session/                active workout logging + finish summary (full-screen modals)
components/              UI primitives + feature components, grouped by domain
hooks/                   React Query hooks wrapping Supabase (one file per feature area)
lib/                     Supabase client, React Query client, auth, gamification formulas, utils
store/                   zustand session store (in-progress workout + timers, persisted)
types/                   hand-written Supabase types + friendlier domain aliases
supabase/migrations/     SQL schema, RLS policies, and Postgres functions (numbered, run in order)
supabase/seed.sql        level thresholds, badges, and the built-in exercise library
```

## 5. How the gamification logic works

XP, PR detection, streaks, and badge unlocks are computed **authoritatively in Postgres**, not on the client — see `supabase/migrations/20260811000008_functions_triggers.sql`. This keeps rewards trust-sensitive and consistent even when a set logged offline syncs later. The client's `lib/gamification/formulas.ts` re-implements the same math only for instant, non-authoritative UI preview (e.g. "this looks like a PR!" while typing) — the server-computed result is always what actually gets shown and saved.

Finishing a workout calls the `fn_complete_session` Postgres RPC, which in one round trip: aggregates volume/sets (warm-ups excluded), awards completion XP, advances the streak (with a one-day streak-freeze grace period), checks every badge's criteria, and returns everything the summary screen needs.

## 6. Offline behavior

The gym is a bad wifi environment. React Query is configured `networkMode: 'offlineFirst'` with its cache persisted to `AsyncStorage`, and `NetInfo` drives its online/offline state — so logging a set while offline queues the write locally and flushes automatically on reconnect, and an in-progress session survives the app being killed. See `lib/queryClient.ts` and `store/sessionStore.ts`.

## 7. Testing & typechecking

```bash
npm run typecheck   # tsc --noEmit across the whole app
npm test            # Jest unit tests for the gamification formulas and pure helpers
```

## 8. Known gaps / next steps

- **Remote push notifications** (scheduled routine reminders while the app is closed) need an [EAS development build](https://docs.expo.dev/develop/development-builds/introduction/) — Expo Go only supports local notifications (rest timer, in-app streak warnings), which already work out of the box.
- **Rotation-style routine scheduling** (A/B/C split across multiple routines) has full data-layer support (`routine_schedules.mode = 'rotation'`, `useTodayPlan`) but no dedicated setup screen yet — only fixed days-of-week scheduling is exposed in the UI.
- **Social features** (friends, leaderboards, shared PR cards, group challenges — PRD §4.6) and **data export** (PRD §4.4) are explicitly out of MVP scope per the PRD.
- Google/Apple OAuth sign-in is wired up (`lib/auth/AuthProvider.tsx`) but requires you to configure your own provider credentials in the Supabase dashboard before it will work.

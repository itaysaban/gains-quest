import type { SetType } from '@/types/database.types';

/**
 * Client-side re-implementations of the authoritative Postgres math (see
 * supabase/migrations/20260811000008_functions_triggers.sql) for INSTANT UI feedback only
 * (e.g. "this looks like a PR!" while typing). The server-computed values from fn_process_logged_set /
 * fn_complete_session are always the values persisted and eventually shown — never trust this module
 * for anything that needs to be correct, only for anything that needs to feel instant.
 */

export function epley1RM(weight: number | null, reps: number | null): number | null {
  if (weight == null || reps == null || reps <= 0) return null;
  return weight * (1 + reps / 30);
}

export function setVolume(weight: number | null, reps: number | null): number {
  return (weight ?? 0) * (reps ?? 1);
}

export function previewSetXp(
  weight: number | null,
  reps: number | null,
  rpe: number | null,
  setType: SetType,
  trailingAvgVolume: number | null,
): number {
  const BASE_XP = 10;
  if (setType === 'warmup') return 2;

  const volume = setVolume(weight, reps);
  const volumeMultiplier =
    trailingAvgVolume && trailingAvgVolume > 0 ? 0.5 + 0.5 * Math.min(volume / trailingAvgVolume, 2) : 1;

  const effortMultiplier = rpe != null ? Math.max(0.8, Math.min(1.3, 1 + (rpe - 7) * 0.05)) : 1;

  return Math.max(1, Math.round(BASE_XP * volumeMultiplier * effortMultiplier));
}

export function xpProgress(totalXp: number, currentLevelThreshold: number, nextLevelThreshold: number | null) {
  const into = totalXp - currentLevelThreshold;
  const span = nextLevelThreshold != null ? nextLevelThreshold - currentLevelThreshold : into || 1;
  return { into, span, ratio: span > 0 ? Math.min(1, into / span) : 1 };
}

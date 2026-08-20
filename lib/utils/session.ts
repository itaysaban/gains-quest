import type { SessionExerciseWithSets } from '@/types/domain';

/** Active Session header's live "mm:ss · kg" line (design handoff §3) — working-set volume across
 * every exercise in the session so far. Warmup sets are excluded from volume totals (PRD §6.1.4);
 * a null reps is treated as 1 and a null weight as 0, matching the server's own
 * coalesce(weight,0)*coalesce(reps,1) convention in fn_award_points_for_session. This is a live,
 * client-side approximation for display only — the authoritative total is computed server-side on
 * completion. */
export function computeLiveVolume(sessionExercises: SessionExerciseWithSets[]): number {
  return sessionExercises
    .flatMap((se) => se.sets)
    .filter((s) => s.set_type !== 'warmup')
    .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 1), 0);
}

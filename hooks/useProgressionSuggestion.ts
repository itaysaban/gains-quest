import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useProfile } from './useProfile';
import { useLastSessionSets } from './useLastSessionSets';
import type { Exercise, SessionExercise } from '@/types/domain';

export interface ProgressionSuggestion {
  type: 'increase' | 'deload';
  deltaKg: number;
}

/** Double-progression model (PRD 6.1.4). Scoped to tracking_type='weight_reps' only — other tracking
 * types have no "weight" to increment. category='legs' uses the lower-body increment, everything else
 * (push/pull/core/cardio) uses the upper-body increment — a reasonable proxy, not a perfect one. */
export function useProgressionSuggestion(
  exercise: Exercise | undefined,
  sessionExercise: Pick<SessionExercise, 'target_reps_min' | 'target_reps_max'> | undefined,
) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data: profile } = useProfile();
  const { data: lastSession } = useLastSessionSets(exercise?.id);

  const scoped = exercise?.tracking_type === 'weight_reps';
  const targetMax = sessionExercise?.target_reps_max ?? null;
  const targetMin = sessionExercise?.target_reps_min ?? null;

  const workingSets = (lastSession?.sets ?? []).filter((s) => s.set_type === 'working');
  const hitTopOfRange =
    scoped && targetMax != null && workingSets.length > 0 && workingSets.every((s) => (s.reps ?? 0) >= targetMax);

  // Deload needs 2 consecutive missed sessions — a small on-demand lookback, not on the hot path,
  // only queried when the (cheaper, already-cached) increase check didn't already fire.
  const deloadQuery = useQuery({
    queryKey: ['progression-deload-check', userId, exercise?.id],
    enabled: !!userId && !!exercise?.id && scoped && !hitTopOfRange && targetMin != null,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('session_exercises')
        .select('id, target_reps_min, sets:logged_sets(reps, set_type), session:workout_sessions!inner(started_at, status)')
        .eq('exercise_id', exercise!.id)
        .eq('session.status', 'completed')
        .order('started_at', { referencedTable: 'session', ascending: false })
        .limit(2);
      if (error) throw error;

      const rows = (data ?? []) as unknown as {
        target_reps_min: number | null;
        sets: { reps: number | null; set_type: string }[];
      }[];
      if (rows.length < 2) return false;

      return rows.every((row) => {
        const working = row.sets.filter((s) => s.set_type === 'working');
        const min = row.target_reps_min;
        return min != null && working.length > 0 && working.some((s) => (s.reps ?? 0) < min);
      });
    },
  });

  if (!scoped || !exercise || !profile) return null;

  if (hitTopOfRange) {
    const deltaKg = exercise.category === 'legs' ? profile.progression_lower_increment_kg : profile.progression_upper_increment_kg;
    return { type: 'increase', deltaKg } satisfies ProgressionSuggestion;
  }

  if (deloadQuery.data) {
    const lastWeight = workingSets[workingSets.length - 1]?.weight ?? 0;
    const deltaKg = -Math.round(((lastWeight * profile.progression_deload_pct) / 100) * 2) / 2; // round to nearest 0.5kg
    return { type: 'deload', deltaKg } satisfies ProgressionSuggestion;
  }

  return null;
}

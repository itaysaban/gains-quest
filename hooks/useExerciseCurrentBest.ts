import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { ExerciseCurrentBest } from '@/types/domain';

export function currentBestQueryKey(userId: string | undefined, exerciseId: string | undefined) {
  return ['exercise-current-best', userId, exerciseId] as const;
}

export function useExerciseCurrentBest(exerciseId: string | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: currentBestQueryKey(userId, exerciseId),
    enabled: !!userId && !!exerciseId,
    queryFn: async (): Promise<ExerciseCurrentBest | null> => {
      const { data, error } = await supabase
        .from('exercise_current_best')
        .select('*')
        .eq('user_id', userId!)
        .eq('exercise_id', exerciseId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Batch-fetches current-best rows for every exercise in a session in one round trip and seeds the
 * per-exercise query cache directly, so each ExerciseLogCard's useExerciseCurrentBest call is a cache
 * hit (no per-card network latency) — used once on session mount.
 */
export function usePrefetchCurrentBestForSession() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return async function prefetch(exerciseIds: string[]) {
    if (!userId || exerciseIds.length === 0) return;

    const { data, error } = await supabase
      .from('exercise_current_best')
      .select('*')
      .eq('user_id', userId)
      .in('exercise_id', exerciseIds);
    if (error) throw error;

    const byExerciseId = new Map((data ?? []).map((row) => [row.exercise_id, row]));
    for (const exerciseId of exerciseIds) {
      queryClient.setQueryData(currentBestQueryKey(userId, exerciseId), byExerciseId.get(exerciseId) ?? null);
    }
  };
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useExerciseCurrentBest } from './useExerciseCurrentBest';
import type { LoggedSet } from '@/types/domain';

export interface LastSessionSets {
  sessionDate: string | null;
  sets: LoggedSet[];
}

// Hoisted so "no prior session" always returns the exact same object reference. Consumers
// (DraftSetRow's pre-fill effect) depend on this value for change detection — a fresh literal
// on every render would look like new data on every render, re-resetting any in-progress typing.
const NO_LAST_SESSION: LastSessionSets = { sessionDate: null, sets: [] };

/**
 * The always-visible "last-time row" data source. Reads the pointer already maintained by
 * fn_complete_session (exercise_current_best.last_session_exercise_id) so this is one targeted,
 * indexed query against logged_sets — never a "most recent session containing this exercise" scan.
 */
export function useLastSessionSets(exerciseId: string | undefined) {
  const { data: currentBest, isLoading: loadingCurrentBest } = useExerciseCurrentBest(exerciseId);
  const lastSessionExerciseId = currentBest?.last_session_exercise_id ?? null;

  const query = useQuery({
    queryKey: ['last-session-sets', lastSessionExerciseId],
    enabled: !!lastSessionExerciseId,
    queryFn: async (): Promise<LastSessionSets> => {
      const { data, error } = await supabase
        .from('logged_sets')
        .select('*')
        .eq('session_exercise_id', lastSessionExerciseId!)
        .order('set_index');
      if (error) throw error;
      return { sessionDate: currentBest!.last_session_completed_at, sets: data };
    },
  });

  return {
    data: lastSessionExerciseId ? query.data : NO_LAST_SESSION,
    isLoading: loadingCurrentBest || (!!lastSessionExerciseId && query.isLoading),
  };
}

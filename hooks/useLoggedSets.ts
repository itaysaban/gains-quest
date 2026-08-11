import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { LoggedSet } from '@/types/domain';
import type { SetType } from '@/types/database.types';

export interface LogSetInput {
  sessionExerciseId: string;
  sessionId: string; // used only for cache invalidation
  setIndex: number;
  setType: SetType;
  weight?: number | null;
  reps?: number | null;
  timeSeconds?: number | null;
  distanceMeters?: number | null;
  rpe?: number | null;
  rir?: number | null;
}

export function useLogSet() {
  const queryClient = useQueryClient();

  return useMutation({
    // networkMode: offlineFirst (set globally in queryClient.ts) means this queues and retries
    // automatically if the gym has no signal — the optimistic cache update below is what the user sees.
    mutationFn: async (input: LogSetInput): Promise<LoggedSet> => {
      const { data, error } = await supabase
        .from('logged_sets')
        .insert({
          session_exercise_id: input.sessionExerciseId,
          set_index: input.setIndex,
          set_type: input.setType,
          weight: input.weight ?? null,
          reps: input.reps ?? null,
          time_seconds: input.timeSeconds ?? null,
          distance_meters: input.distanceMeters ?? null,
          rpe: input.rpe ?? null,
          rir: input.rir ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', vars.sessionId] });
    },
  });
}

export function useUpdateLoggedSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      sessionId,
      patch,
    }: {
      id: string;
      sessionId: string;
      patch: Partial<Pick<LoggedSet, 'weight' | 'reps' | 'time_seconds' | 'distance_meters' | 'rpe' | 'rir' | 'set_type'>>;
    }) => {
      const { error } = await supabase.from('logged_sets').update(patch).eq('id', id);
      if (error) throw error;
      return sessionId;
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', sessionId] });
    },
  });
}

export function useDeleteLoggedSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, sessionId }: { id: string; sessionId: string }) => {
      const { error } = await supabase.from('logged_sets').delete().eq('id', id);
      if (error) throw error;
      return sessionId;
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', sessionId] });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useSessionStore } from '@/store/sessionStore';
import { mutationKeys } from '@/lib/mutationKeys';
import type { CompleteSessionResult, SessionExerciseWithSets, WorkoutSession } from '@/types/domain';
import type { RoutineExerciseWithDetails } from '@/types/domain';

export function useSessionExercises(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ['session-exercises', sessionId],
    enabled: !!sessionId,
    refetchInterval: false,
    // Every mutation that touches this data (log/update/delete a set, add/remove/swap an exercise)
    // already invalidates this key explicitly and optimistically patches the cache — no time-based
    // staleness needed, and avoiding it prevents an unwanted background refetch from flashing a
    // stale/empty state while offline mid-session.
    staleTime: Infinity,
    queryFn: async (): Promise<SessionExerciseWithSets[]> => {
      const { data, error } = await supabase
        .from('session_exercises')
        .select('*, exercise:exercises(*), sets:logged_sets(*)')
        .eq('session_id', sessionId!)
        .order('order_index');
      if (error) throw error;
      const rows = data as unknown as SessionExerciseWithSets[];
      rows.forEach((r) => r.sets.sort((a, b) => a.set_index - b.set_index));
      return rows;
    },
  });
}

export function useStartSession() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const startSessionStore = useSessionStore((s) => s.startSession);

  return useMutation({
    mutationFn: async (input: {
      routineId?: string | null;
      routineExercises?: RoutineExerciseWithDetails[];
      workoutType?: string | null;
    }) => {
      const localDate = new Date().toLocaleDateString('en-CA'); // yyyy-mm-dd in the device's local timezone
      const { data: newSession, error } = await supabase
        .from('workout_sessions')
        .insert({
          user_id: userId!,
          routine_id: input.routineId ?? null,
          workout_type: input.workoutType ?? null,
          local_date: localDate,
        })
        .select()
        .single();
      if (error) throw error;

      if (input.routineExercises?.length) {
        const rows = input.routineExercises.map((re) => ({
          session_id: newSession.id,
          exercise_id: re.exercise_id,
          order_index: re.order_index,
          superset_group_id: re.superset_group_id,
          rest_seconds: re.rest_seconds,
          target_reps_min: re.target_reps_min,
          target_reps_max: re.target_reps_max,
        }));
        const { error: seedError } = await supabase.from('session_exercises').insert(rows);
        if (seedError) throw seedError;
      }

      return newSession as WorkoutSession;
    },
    onSuccess: (newSession, input) => {
      startSessionStore(newSession.id, input.routineId ?? null);
      queryClient.invalidateQueries({ queryKey: ['session-exercises', newSession.id] });
    },
  });
}

export interface AddExerciseToSessionInput {
  sessionId: string;
  exerciseId: string;
  orderIndex: number;
  supersetGroupId?: string | null;
  restSeconds?: number | null;
}

/** Standalone export so it can be registered as a resumable mutation default (lib/registerMutationDefaults.ts). */
export async function addExerciseToSessionMutationFn(input: AddExerciseToSessionInput) {
  const { data, error } = await supabase
    .from('session_exercises')
    .insert({
      session_id: input.sessionId,
      exercise_id: input.exerciseId,
      order_index: input.orderIndex,
      superset_group_id: input.supersetGroupId ?? null,
      rest_seconds: input.restSeconds ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function useAddExerciseToSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: mutationKeys.addExerciseToSession,
    mutationFn: addExerciseToSessionMutationFn,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', data.session_id] });
    },
  });
}

/** Remove/"skip" an exercise from the active session. Cascades its logged_sets — callers should only
 * offer this once no meaningful sets exist for the exercise, or treat it as an explicit destructive
 * action the user has confirmed. */
export function useRemoveExerciseFromSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, sessionId }: { id: string; sessionId: string }) => {
      const { error } = await supabase.from('session_exercises').delete().eq('id', id);
      if (error) throw error;
      return sessionId;
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', sessionId] });
    },
  });
}

/** Swap which exercise a session_exercises row points to, in place — preserves order_index and
 * superset_group_id since it's the same row. Only safe when zero sets have been logged against it yet
 * (the UI is responsible for that guard): existing sets would otherwise stay attached to a row that now
 * represents a different exercise than what was actually performed. */
export function useSwapSessionExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, sessionId, newExerciseId }: { id: string; sessionId: string; newExerciseId: string }) => {
      const { error } = await supabase.from('session_exercises').update({ exercise_id: newExerciseId }).eq('id', id);
      if (error) throw error;
      return sessionId;
    },
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', sessionId] });
    },
  });
}

export function useCompleteSession() {
  const queryClient = useQueryClient();
  const endSessionStore = useSessionStore((s) => s.endSession);

  return useMutation({
    mutationFn: async (sessionId: string): Promise<CompleteSessionResult> => {
      const { data, error } = await supabase.rpc('fn_complete_session', { p_session_id: sessionId });
      if (error) throw error;
      return data as CompleteSessionResult;
    },
    onSuccess: () => {
      endSessionStore();
      queryClient.invalidateQueries({ queryKey: ['workout-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['user-level'] });
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      queryClient.invalidateQueries({ queryKey: ['badges'] });
      queryClient.invalidateQueries({ queryKey: ['personal-records'] });
    },
  });
}

export function useDiscardSession() {
  const queryClient = useQueryClient();
  const endSessionStore = useSessionStore((s) => s.endSession);

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.from('workout_sessions').update({ status: 'discarded' }).eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      endSessionStore();
      queryClient.invalidateQueries({ queryKey: ['workout-sessions'] });
    },
  });
}

export function useUpdateSessionNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ sessionId, notes }: { sessionId: string; notes: string }) => {
      const { error } = await supabase.from('workout_sessions').update({ notes }).eq('id', sessionId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['workout-session', vars.sessionId] }),
  });
}

export function useRecentSessions(limit = 20) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['workout-sessions', userId, limit],
    enabled: !!userId,
    queryFn: async (): Promise<WorkoutSession[]> => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('status', 'completed')
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useWorkoutSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['workout-session', sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<WorkoutSession> => {
      const { data, error } = await supabase.from('workout_sessions').select('*').eq('id', sessionId!).single();
      if (error) throw error;
      return data;
    },
  });
}

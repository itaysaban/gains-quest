import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useSessionStore } from '@/store/sessionStore';
import type { CompleteSessionResult, SessionExerciseWithSets, WorkoutSession } from '@/types/domain';
import type { RoutineExerciseWithDetails } from '@/types/domain';

export function useSessionExercises(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: ['session-exercises', sessionId],
    enabled: !!sessionId,
    refetchInterval: false,
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
    mutationFn: async (input: { routineId?: string | null; routineExercises?: RoutineExerciseWithDetails[] }) => {
      const { data: newSession, error } = await supabase
        .from('workout_sessions')
        .insert({ user_id: userId!, routine_id: input.routineId ?? null })
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

export function useAddExerciseToSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      sessionId: string;
      exerciseId: string;
      orderIndex: number;
      supersetGroupId?: string | null;
      restSeconds?: number | null;
    }) => {
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
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', data.session_id] });
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

/** Powers the "last time: 60kg x 8" auto-suggest (PRD 4.3) — most recent working set logged for this exercise. */
export function useLastSetForExercise(exerciseId: string | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['last-set', userId, exerciseId],
    enabled: !!userId && !!exerciseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logged_sets')
        .select('*, session_exercise:session_exercises!inner(exercise_id)')
        .eq('session_exercise.exercise_id', exerciseId!)
        .neq('set_type', 'warmup')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
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

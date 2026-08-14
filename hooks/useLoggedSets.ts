import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import { generateUuid } from '@/lib/utils/uuid';
import { epley1RM, setVolume } from '@/lib/gamification/formulas';
import { mutationKeys } from '@/lib/mutationKeys';
import { currentBestQueryKey } from './useExerciseCurrentBest';
import type { LoggedSet, SessionExerciseWithSets, ExerciseCurrentBest } from '@/types/domain';
import type { SetType } from '@/types/database.types';

export interface LogSetInput {
  sessionExerciseId: string;
  sessionId: string;
  exerciseId: string; // needed to compare against the current-best cache for optimistic PR detection
  setIndex: number;
  setType: SetType;
  weight?: number | null;
  reps?: number | null;
  timeSeconds?: number | null;
  distanceMeters?: number | null;
  rpe?: number | null;
  rir?: number | null;
}

type SessionExercisesCache = SessionExerciseWithSets[] | undefined;

/** Mirrors the server's PR gates (supabase/migrations/20260814000004_e1rm_and_pr_fixes.sql,
 * fn_process_logged_set) across all four PRD 6.1.4 PR types: max_weight, est_1rm, max_reps_at_weight,
 * best_set_volume. Reps-at-weight can only be checked for the cached best_weight tier — the client
 * doesn't have a full per-weight rep history — so a rep PR at any other weight is caught on refetch
 * instead of instantly; that's a same-day-as-today miss, not a regression. */
export function computeOptimisticPr(
  input: Pick<LogSetInput, 'setType' | 'weight' | 'reps'>,
  currentBest: ExerciseCurrentBest | null | undefined,
): { isPr: boolean; e1rm: number | null } {
  if (input.setType === 'warmup') return { isPr: false, e1rm: null };

  const e1rmEligible = input.setType === 'working' && input.reps != null && input.reps >= 1 && input.reps <= 12;
  const e1rm = e1rmEligible ? epley1RM(input.weight ?? null, input.reps ?? null) : null;
  const volume = setVolume(input.weight ?? null, input.reps ?? null);

  const beatsWeight = input.weight != null && (currentBest?.best_weight == null || input.weight > currentBest.best_weight);
  const beatsE1rm = e1rm != null && (currentBest?.best_est_1rm == null || e1rm > currentBest.best_est_1rm);
  const beatsSetVolume =
    input.weight != null && input.reps != null && (currentBest?.best_set_volume == null || volume > currentBest.best_set_volume);
  const beatsRepsAtBestWeight =
    input.weight != null &&
    input.reps != null &&
    currentBest?.best_weight != null &&
    input.weight === currentBest.best_weight &&
    (currentBest.best_weight_reps == null || input.reps > currentBest.best_weight_reps);

  return { isPr: beatsWeight || beatsE1rm || beatsSetVolume || beatsRepsAtBestWeight, e1rm };
}

/** Exported standalone so it can be registered as a resumable mutation default (lib/registerMutationDefaults.ts)
 * AND used directly by useLogSet — one implementation, not two copies that could drift.
 * upsert (not insert): the set's id is client-generated, so if this mutation is queued offline, actually
 * succeeds server-side, then gets resumed again after an app-kill before the client learns it succeeded,
 * retrying is a harmless no-op instead of a duplicate-key error. */
export async function logSetMutationFn(input: LogSetInput & { clientId: string }): Promise<LoggedSet> {
  const { data, error } = await supabase
    .from('logged_sets')
    .upsert({
      id: input.clientId,
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
}

/**
 * Optimistic, offline-tolerant set logging — the mechanism both instant client-side PR detection and
 * local-first persistence depend on. The set's id is generated client-side (same generateUuid() already
 * used for superset_group_id) so the optimistic row and the eventual server row share one id, making
 * reconciliation on refetch a trivial replace rather than a heuristic match. The optimistic is_pr/e1rm_kg
 * are compared against the prefetched exercise_current_best cache and are NEVER authoritative — the
 * server trigger (fn_process_logged_set) always has the final say once the mutation settles.
 */
function useLogSetMutation() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id;

  return useMutation({
    mutationKey: mutationKeys.logSet,
    mutationFn: logSetMutationFn,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['session-exercises', input.sessionId] });
      const previous = queryClient.getQueryData<SessionExercisesCache>(['session-exercises', input.sessionId]);

      const currentBest = queryClient.getQueryData<ExerciseCurrentBest | null>(
        currentBestQueryKey(userId, input.exerciseId),
      );
      const { isPr, e1rm } = computeOptimisticPr(input, currentBest);

      const optimisticSet: LoggedSet = {
        id: input.clientId,
        session_exercise_id: input.sessionExerciseId,
        user_id: userId ?? '',
        set_index: input.setIndex,
        set_type: input.setType,
        weight: input.weight ?? null,
        reps: input.reps ?? null,
        time_seconds: input.timeSeconds ?? null,
        distance_meters: input.distanceMeters ?? null,
        rpe: input.rpe ?? null,
        rir: input.rir ?? null,
        is_pr: isPr,
        e1rm_kg: e1rm,
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueryData<SessionExercisesCache>(['session-exercises', input.sessionId], (old) =>
        old?.map((se) =>
          se.id === input.sessionExerciseId
            ? { ...se, sets: [...se.sets, optimisticSet].sort((a, b) => a.set_index - b.set_index) }
            : se,
        ),
      );

      return { previous, optimisticSetId: input.clientId };
    },
    onError: (_err, input, context) => {
      queryClient.setQueryData(['session-exercises', input.sessionId], context?.previous);
    },
    onSettled: (_data, _error, input) => {
      queryClient.invalidateQueries({ queryKey: ['session-exercises', input.sessionId] });
    },
  });
}

/** Public hook — generates the client-side set id internally so callers pass a plain LogSetInput. */
export function useLogSet() {
  const mutation = useLogSetMutation();
  return {
    ...mutation,
    mutate: (input: LogSetInput) => mutation.mutate({ ...input, clientId: generateUuid() }),
    mutateAsync: (input: LogSetInput) => mutation.mutateAsync({ ...input, clientId: generateUuid() }),
  };
}

export interface UpdateLoggedSetInput {
  id: string;
  sessionId: string;
  patch: Partial<Pick<LoggedSet, 'weight' | 'reps' | 'time_seconds' | 'distance_meters' | 'rpe' | 'rir' | 'set_type'>>;
}

export async function updateLoggedSetMutationFn({ id, patch }: UpdateLoggedSetInput) {
  const { error } = await supabase.from('logged_sets').update(patch).eq('id', id);
  if (error) throw error;
}

export function useUpdateLoggedSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: mutationKeys.updateLoggedSet,
    mutationFn: async (input: UpdateLoggedSetInput) => {
      await updateLoggedSetMutationFn(input);
      return input.sessionId;
    },
    onMutate: async ({ id, sessionId, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['session-exercises', sessionId] });
      const previous = queryClient.getQueryData<SessionExercisesCache>(['session-exercises', sessionId]);

      queryClient.setQueryData<SessionExercisesCache>(['session-exercises', sessionId], (old) =>
        old?.map((se) => ({
          ...se,
          sets: se.sets.map((set) => (set.id === id ? { ...set, ...patch } : set)),
        })),
      );

      return { previous };
    },
    onError: (_err, { sessionId }, context) => {
      queryClient.setQueryData(['session-exercises', sessionId], context?.previous);
    },
    onSettled: (sessionId) => {
      if (sessionId) queryClient.invalidateQueries({ queryKey: ['session-exercises', sessionId] });
    },
  });
}

export interface DeleteLoggedSetInput {
  id: string;
  sessionId: string;
}

export async function deleteLoggedSetMutationFn({ id }: DeleteLoggedSetInput) {
  const { error } = await supabase.from('logged_sets').delete().eq('id', id);
  if (error) throw error;
}

export function useDeleteLoggedSet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: mutationKeys.deleteLoggedSet,
    mutationFn: async (input: DeleteLoggedSetInput) => {
      await deleteLoggedSetMutationFn(input);
      return input.sessionId;
    },
    onMutate: async ({ id, sessionId }) => {
      await queryClient.cancelQueries({ queryKey: ['session-exercises', sessionId] });
      const previous = queryClient.getQueryData<SessionExercisesCache>(['session-exercises', sessionId]);

      queryClient.setQueryData<SessionExercisesCache>(['session-exercises', sessionId], (old) =>
        old?.map((se) => ({ ...se, sets: se.sets.filter((set) => set.id !== id) })),
      );

      return { previous };
    },
    onError: (_err, { sessionId }, context) => {
      queryClient.setQueryData(['session-exercises', sessionId], context?.previous);
    },
    onSettled: (sessionId) => {
      if (sessionId) queryClient.invalidateQueries({ queryKey: ['session-exercises', sessionId] });
    },
  });
}

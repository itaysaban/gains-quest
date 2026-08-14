import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Routine, RoutineExercise, RoutineExerciseWithDetails, RoutineSchedule } from '@/types/domain';
import type { RoutineFormValues, RoutineExerciseTargetValues } from '@/lib/utils/validation/routine';

export function useRoutines(includeArchived = false) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['routines', userId, includeArchived],
    enabled: !!userId,
    queryFn: async (): Promise<Routine[]> => {
      let query = supabase.from('routines').select('*').order('created_at', { ascending: false });
      if (!includeArchived) query = query.eq('is_archived', false);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

/** Distinct existing folder names for this user, for autocomplete on the routine form — folder is a
 * free-text tag (not a first-class table), so this is just a light distinct-values query. */
export function useRoutineFolders() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['routine-folders', userId],
    enabled: !!userId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('routines').select('folder').not('folder', 'is', null);
      if (error) throw error;
      return Array.from(new Set(data.map((r) => r.folder).filter((f): f is string => !!f))).sort();
    },
  });
}

export function useRoutine(routineId: string | undefined) {
  return useQuery({
    queryKey: ['routine', routineId],
    enabled: !!routineId,
    queryFn: async (): Promise<Routine> => {
      const { data, error } = await supabase.from('routines').select('*').eq('id', routineId!).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useRoutineExercises(routineId: string | undefined) {
  return useQuery({
    queryKey: ['routine-exercises', routineId],
    enabled: !!routineId,
    queryFn: async (): Promise<RoutineExerciseWithDetails[]> => {
      const { data, error } = await supabase
        .from('routine_exercises')
        .select('*, exercise:exercises(*)')
        .eq('routine_id', routineId!)
        .order('order_index');
      if (error) throw error;
      return data as unknown as RoutineExerciseWithDetails[];
    },
  });
}

function invalidateRoutines(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['routines', userId] });
}

export function useCreateRoutine() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: RoutineFormValues) => {
      const { data, error } = await supabase
        .from('routines')
        .insert({ user_id: userId!, name: values.name, description: values.description || null, folder: values.folder || null })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateRoutines(queryClient, userId),
  });
}

export function useUpdateRoutine() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Routine> }) => {
      const { error } = await supabase.from('routines').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      invalidateRoutines(queryClient, userId);
      queryClient.invalidateQueries({ queryKey: ['routine', vars.id] });
    },
  });
}

export function useDuplicateRoutine() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ routineId, newName }: { routineId: string; newName?: string }) => {
      const { data, error } = await supabase.rpc('fn_duplicate_routine', {
        p_routine_id: routineId,
        p_new_name: newName ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateRoutines(queryClient, userId),
  });
}

export function useAddExerciseToRoutine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      routineId: string;
      exerciseId: string;
      orderIndex: number;
      supersetGroupId?: string | null;
      targets?: RoutineExerciseTargetValues;
    }) => {
      const { data, error } = await supabase
        .from('routine_exercises')
        .insert({
          routine_id: input.routineId,
          exercise_id: input.exerciseId,
          order_index: input.orderIndex,
          superset_group_id: input.supersetGroupId ?? null,
          target_sets: input.targets?.targetSets ?? null,
          target_reps_min: input.targets?.targetRepsMin ?? null,
          target_reps_max: input.targets?.targetRepsMax ?? null,
          target_weight: input.targets?.targetWeight ?? null,
          rest_seconds: input.targets?.restSeconds ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['routine-exercises', data.routine_id] });
    },
  });
}

export function useUpdateRoutineExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      routineId,
      patch,
    }: {
      id: string;
      routineId: string;
      patch: Partial<RoutineExercise>;
    }) => {
      const { error } = await supabase.from('routine_exercises').update(patch).eq('id', id);
      if (error) throw error;
      return routineId;
    },
    onSuccess: (routineId) => {
      queryClient.invalidateQueries({ queryKey: ['routine-exercises', routineId] });
    },
  });
}

/** Bulk reorder after a drag-and-drop — writes every affected order_index in one round trip. */
export function useReorderRoutineExercises() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ routineId, ordered }: { routineId: string; ordered: { id: string; order_index: number }[] }) => {
      await Promise.all(
        ordered.map((item) =>
          supabase.from('routine_exercises').update({ order_index: item.order_index }).eq('id', item.id),
        ),
      );
      return routineId;
    },
    onSuccess: (routineId) => {
      queryClient.invalidateQueries({ queryKey: ['routine-exercises', routineId] });
    },
  });
}

export function useRemoveRoutineExercise() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, routineId }: { id: string; routineId: string }) => {
      const { error } = await supabase.from('routine_exercises').delete().eq('id', id);
      if (error) throw error;
      return routineId;
    },
    onSuccess: (routineId) => {
      queryClient.invalidateQueries({ queryKey: ['routine-exercises', routineId] });
    },
  });
}

export function useRoutineSchedule(routineId: string | undefined) {
  return useQuery({
    queryKey: ['routine-schedule', routineId],
    enabled: !!routineId,
    queryFn: async (): Promise<RoutineSchedule | null> => {
      const { data, error } = await supabase
        .from('routine_schedules')
        .select('*')
        .contains('rotation_routine_ids', [routineId!])
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertSchedule() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: Pick<RoutineSchedule, 'mode' | 'days_of_week' | 'rotation_routine_ids' | 'notify' | 'notify_time'> & {
        id?: string;
      },
    ) => {
      const { id, ...fields } = input;
      if (id) {
        const { error } = await supabase.from('routine_schedules').update(fields).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('routine_schedules').insert({ ...fields, user_id: userId! });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routine-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['schedules', userId] });
    },
  });
}

export function useSchedules() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['schedules', userId],
    enabled: !!userId,
    queryFn: async (): Promise<RoutineSchedule[]> => {
      const { data, error } = await supabase.from('routine_schedules').select('*');
      if (error) throw error;
      return data;
    },
  });
}

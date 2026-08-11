import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Exercise } from '@/types/domain';
import type { ExerciseCategory, EquipmentType } from '@/types/database.types';
import type { ExerciseFormValues } from '@/lib/utils/validation/exercise';

export interface ExerciseFilters {
  search?: string;
  category?: ExerciseCategory;
  equipment?: EquipmentType;
  customOnly?: boolean;
  favoritesOnly?: boolean;
  includeArchived?: boolean;
}

export function useExercises(filters: ExerciseFilters = {}) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['exercises', userId, filters],
    enabled: !!userId,
    queryFn: async (): Promise<Exercise[]> => {
      let query = supabase.from('exercises').select('*').order('is_favorite', { ascending: false }).order('name');

      if (!filters.includeArchived) query = query.eq('is_archived', false);
      if (filters.category) query = query.eq('category', filters.category);
      if (filters.equipment) query = query.eq('equipment', filters.equipment);
      if (filters.customOnly) query = query.eq('is_system', false);
      if (filters.favoritesOnly) query = query.eq('is_favorite', true);
      if (filters.search) query = query.ilike('name', `%${filters.search}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useExercise(exerciseId: string | undefined) {
  return useQuery({
    queryKey: ['exercise', exerciseId],
    enabled: !!exerciseId,
    queryFn: async (): Promise<Exercise> => {
      const { data, error } = await supabase.from('exercises').select('*').eq('id', exerciseId!).single();
      if (error) throw error;
      return data;
    },
  });
}

/** Client-side pre-check for the duplicate-name warning (PRD 4.1) before attempting an insert. */
export function useCheckDuplicateExerciseName() {
  return useMutation({
    mutationFn: async ({ name, userId }: { name: string; userId: string }) => {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name')
        .eq('user_id', userId)
        .eq('is_archived', false)
        .ilike('name', name.trim());
      if (error) throw error;
      return data;
    },
  });
}

function invalidateExercises(queryClient: ReturnType<typeof useQueryClient>, userId?: string) {
  queryClient.invalidateQueries({ queryKey: ['exercises', userId] });
}

export function useCreateExercise() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: ExerciseFormValues) => {
      const { data, error } = await supabase
        .from('exercises')
        .insert({
          user_id: userId!,
          name: values.name,
          category: values.category,
          muscle_groups: values.muscleGroups,
          equipment: values.equipment,
          tracking_type: values.trackingType,
          notes: values.notes || null,
          custom_fields: values.customFields,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateExercises(queryClient, userId),
  });
}

export function useUpdateExercise() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Exercise> }) => {
      const { data, error } = await supabase.from('exercises').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      invalidateExercises(queryClient, userId);
      queryClient.invalidateQueries({ queryKey: ['exercise', data.id] });
    },
  });
}

export function useCloneExercise() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (source: Exercise) => {
      const { data, error } = await supabase
        .from('exercises')
        .insert({
          user_id: userId!,
          name: `${source.name} (Variation)`,
          category: source.category,
          muscle_groups: source.muscle_groups,
          equipment: source.equipment,
          tracking_type: source.tracking_type,
          custom_fields: source.custom_fields,
          notes: source.notes,
          source_exercise_id: source.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidateExercises(queryClient, userId),
  });
}

export function useToggleFavoriteExercise() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      const { error } = await supabase.from('exercises').update({ is_favorite: isFavorite }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateExercises(queryClient, userId),
  });
}

export function useArchiveExercise() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('exercises').update({ is_archived: archived }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateExercises(queryClient, userId),
  });
}

/** DB rejects this if the exercise has any logged history (see prevent_delete_exercise_with_logs trigger). */
export function useDeleteExercise() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('exercises').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => invalidateExercises(queryClient, userId),
  });
}

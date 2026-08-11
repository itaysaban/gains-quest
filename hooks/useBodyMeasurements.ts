import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { BodyMeasurement } from '@/types/domain';
import type { MeasurementType } from '@/types/database.types';

export function useBodyMeasurements(type?: MeasurementType) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['body-measurements', userId, type],
    enabled: !!userId,
    queryFn: async (): Promise<BodyMeasurement[]> => {
      let query = supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', userId!)
        .order('recorded_at', { ascending: true });
      if (type) query = query.eq('measurement_type', type);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useAddBodyMeasurement() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      measurementType: MeasurementType;
      subType?: string | null;
      value: number;
      unit: string;
      recordedAt?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('body_measurements')
        .insert({
          user_id: userId!,
          measurement_type: input.measurementType,
          sub_type: input.subType ?? null,
          value: input.value,
          unit: input.unit,
          recorded_at: input.recordedAt ?? new Date().toISOString().slice(0, 10),
          notes: input.notes,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['body-measurements', userId] }),
  });
}

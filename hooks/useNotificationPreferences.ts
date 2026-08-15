import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { NotificationPreferences } from '@/types/domain';

export function useNotificationPreferences() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['notification-preferences', userId],
    enabled: !!userId,
    queryFn: async (): Promise<NotificationPreferences> => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateNotificationPreferences() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const queryKey = ['notification-preferences', userId];

  return useMutation({
    mutationFn: async (patch: Partial<NotificationPreferences>) => {
      const { error } = await supabase.from('notification_preferences').update(patch).eq('user_id', userId!);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<NotificationPreferences>(queryKey);
      queryClient.setQueryData<NotificationPreferences>(queryKey, (old) => (old ? { ...old, ...patch } : old));
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

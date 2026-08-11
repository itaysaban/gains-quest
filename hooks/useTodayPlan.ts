import { useQuery } from '@tanstack/react-query';
import { differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Routine } from '@/types/domain';

/** Resolves today's scheduled routine(s), supporting both fixed days-of-week and an A/B/C rotation anchor. */
export function useTodayPlan() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['today-plan', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Routine[]> => {
      const { data: schedules, error } = await supabase.from('routine_schedules').select('*');
      if (error) throw error;

      const today = new Date();
      const weekday = today.getDay();
      const routineIds = new Set<string>();

      for (const schedule of schedules ?? []) {
        if (schedule.mode === 'days_of_week' && schedule.days_of_week?.includes(weekday)) {
          // days_of_week schedules store routine ids in rotation_routine_ids as a single-item list for simplicity
          schedule.rotation_routine_ids?.forEach((id) => routineIds.add(id));
        } else if (schedule.mode === 'rotation' && schedule.rotation_routine_ids?.length && schedule.rotation_anchor_date) {
          const daysSinceAnchor = differenceInCalendarDays(today, new Date(schedule.rotation_anchor_date));
          const idx = ((daysSinceAnchor % schedule.rotation_routine_ids.length) + schedule.rotation_routine_ids.length) % schedule.rotation_routine_ids.length;
          routineIds.add(schedule.rotation_routine_ids[idx]);
        }
      }

      if (routineIds.size === 0) return [];

      const { data: routines, error: routinesError } = await supabase
        .from('routines')
        .select('*')
        .in('id', Array.from(routineIds))
        .eq('is_archived', false);
      if (routinesError) throw routinesError;
      return routines;
    },
  });
}

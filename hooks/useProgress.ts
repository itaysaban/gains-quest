import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import { epley1RM, setVolume } from '@/lib/gamification/formulas';
import { isoDateOnly } from '@/lib/utils/date';
import type { LoggedSet, WorkoutSession } from '@/types/domain';

export interface ExerciseHistoryEntry {
  set: LoggedSet;
  sessionDate: string;
  sessionId: string;
}

export function useExerciseHistory(exerciseId: string | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['exercise-history', userId, exerciseId],
    enabled: !!userId && !!exerciseId,
    queryFn: async (): Promise<ExerciseHistoryEntry[]> => {
      const { data, error } = await supabase
        .from('logged_sets')
        .select('*, session_exercise:session_exercises!inner(exercise_id, session_id, session:workout_sessions(started_at, status))')
        .eq('session_exercise.exercise_id', exerciseId!)
        .neq('set_type', 'warmup')
        .order('completed_at', { ascending: true });
      if (error) throw error;

      return (data as any[])
        .filter((row) => row.session_exercise.session.status === 'completed')
        .map((row) => ({
          set: row as LoggedSet,
          sessionDate: row.session_exercise.session.started_at,
          sessionId: row.session_exercise.session_id,
        }));
    },
  });
}

export type ChartMetric = 'max_weight' | 'est_1rm' | 'volume';

export function aggregateHistoryByDay(entries: ExerciseHistoryEntry[], metric: ChartMetric) {
  const byDay = new Map<string, number>();

  for (const entry of entries) {
    const day = isoDateOnly(new Date(entry.sessionDate));
    const value =
      metric === 'max_weight'
        ? (entry.set.weight ?? 0)
        : metric === 'est_1rm'
          ? (epley1RM(entry.set.weight, entry.set.reps) ?? 0)
          : setVolume(entry.set.weight, entry.set.reps);

    const current = byDay.get(day) ?? 0;
    byDay.set(day, metric === 'volume' ? current + value : Math.max(current, value));
  }

  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
}

export function useSessionActivityByDate(daysBack = 100) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['session-activity', userId, daysBack],
    enabled: !!userId,
    queryFn: async (): Promise<Record<string, number>> => {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      const { data, error } = await supabase
        .from('workout_sessions')
        .select('started_at')
        .eq('status', 'completed')
        .gte('started_at', since.toISOString());
      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of data) {
        const key = isoDateOnly(new Date(row.started_at));
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    },
  });
}

export function useSessionsOnDate(date: string | undefined) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['sessions-on-date', userId, date],
    enabled: !!userId && !!date,
    queryFn: async (): Promise<WorkoutSession[]> => {
      const dayStart = new Date(`${date}T00:00:00`);
      const dayEnd = new Date(`${date}T23:59:59.999`);
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('status', 'completed')
        .gte('started_at', dayStart.toISOString())
        .lte('started_at', dayEnd.toISOString());
      if (error) throw error;
      return data;
    },
  });
}

/** Weekly volume per muscle group, for the "highlights under-trained muscle groups" dashboard (PRD 4.4). */
export function useVolumeByMuscleGroup(daysBack = 7) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['volume-by-muscle', userId, daysBack],
    enabled: !!userId,
    queryFn: async (): Promise<{ label: string; value: number }[]> => {
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      const { data, error } = await supabase
        .from('logged_sets')
        .select('weight, reps, set_type, session_exercise:session_exercises!inner(exercise:exercises(muscle_groups), session:workout_sessions(started_at, status))')
        .neq('set_type', 'warmup')
        .gte('completed_at', since.toISOString());
      if (error) throw error;

      const totals = new Map<string, number>();
      for (const row of data as any[]) {
        if (row.session_exercise.session.status !== 'completed') continue;
        const volume = setVolume(row.weight, row.reps);
        for (const group of row.session_exercise.exercise.muscle_groups as string[]) {
          totals.set(group, (totals.get(group) ?? 0) + volume);
        }
      }

      return Array.from(totals.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);
    },
  });
}

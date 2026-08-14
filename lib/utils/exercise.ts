import type { TrackingType } from '@/types/database.types';

export const TRACKING_TYPE_LABELS: Record<TrackingType, string> = {
  weight_reps: 'Weight × Reps',
  bodyweight_reps: 'Bodyweight Reps',
  time: 'Time',
  distance: 'Distance',
  distance_duration: 'Distance + Time',
};

export interface SplitMuscleGroups {
  primary: string | null;
  secondary: string[];
}

/** `exercises.muscle_groups` isn't split into separate primary/secondary columns — the seed data
 * (supabase/seed.sql, supabase/seed_exercises.sql) orders each exercise's array with the primary
 * mover first (e.g. Barbell Bench Press: chest, triceps, shoulders), so index 0 is treated as
 * primary and the rest as secondary for display, rather than adding a new column. */
export function splitMuscleGroups(muscleGroups: string[]): SplitMuscleGroups {
  const [primary = null, ...secondary] = muscleGroups;
  return { primary, secondary };
}

import type { Database } from './database.types';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Exercise = Database['public']['Tables']['exercises']['Row'];
export type Routine = Database['public']['Tables']['routines']['Row'];
export type RoutineExercise = Database['public']['Tables']['routine_exercises']['Row'];
export type RoutineSchedule = Database['public']['Tables']['routine_schedules']['Row'];
export type WorkoutSession = Database['public']['Tables']['workout_sessions']['Row'];
export type SessionExercise = Database['public']['Tables']['session_exercises']['Row'];
export type LoggedSet = Database['public']['Tables']['logged_sets']['Row'];
export type PersonalRecord = Database['public']['Tables']['personal_records']['Row'];
export type ExerciseCurrentBest = Database['public']['Tables']['exercise_current_best']['Row'];
export type BodyMeasurement = Database['public']['Tables']['body_measurements']['Row'];
export type XpEvent = Database['public']['Tables']['xp_events']['Row'];
export type PointLedgerEntry = Database['public']['Tables']['point_ledger']['Row'];
export type UserLevel = Database['public']['Tables']['user_levels']['Row'];
export type Streak = Database['public']['Tables']['streaks']['Row'];
export type Badge = Database['public']['Tables']['badges']['Row'];
export type UserBadge = Database['public']['Tables']['user_badges']['Row'];
export type NotificationPreferences = Database['public']['Tables']['notification_preferences']['Row'];

export type CompleteSessionResult = Database['public']['Functions']['fn_complete_session']['Returns'];

/** Routine exercise joined with its exercise details, as the routine builder/session screens consume it. */
export interface RoutineExerciseWithDetails extends RoutineExercise {
  exercise: Exercise;
}

/** Session exercise joined with its logged sets, as the active session screen consumes it. */
export interface SessionExerciseWithSets extends SessionExercise {
  exercise: Exercise;
  sets: LoggedSet[];
}

/** One row per group_id in a superset chain, or a single-exercise "group" of one. */
export interface ExerciseGroup<T extends { superset_group_id: string | null }> {
  groupId: string | null;
  items: T[];
}

export function groupBySuperset<T extends { superset_group_id: string | null; order_index: number }>(
  items: T[],
): ExerciseGroup<T>[] {
  const sorted = [...items].sort((a, b) => a.order_index - b.order_index);
  const groups: ExerciseGroup<T>[] = [];
  const seenGroupIds = new Set<string>();

  for (const item of sorted) {
    if (item.superset_group_id && seenGroupIds.has(item.superset_group_id)) {
      const group = groups.find((g) => g.groupId === item.superset_group_id);
      group?.items.push(item);
      continue;
    }
    if (item.superset_group_id) seenGroupIds.add(item.superset_group_id);
    groups.push({ groupId: item.superset_group_id, items: [item] });
  }

  return groups;
}

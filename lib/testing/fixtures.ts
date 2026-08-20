import type { Exercise, ExerciseCurrentBest, LoggedSet, Profile, RoutineExerciseWithDetails, SessionExerciseWithSets } from '@/types/domain';

let counter = 0;
function id(prefix: string) {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: id('exercise'),
    user_id: null,
    name: 'Bench Press',
    category: 'push',
    muscle_groups: ['chest'],
    equipment: 'barbell',
    tracking_type: 'weight_reps',
    is_favorite: false,
    is_archived: false,
    is_system: true,
    custom_fields: [],
    notes: null,
    photo_url: null,
    source_exercise_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Exercise;
}

export function makeLoggedSet(overrides: Partial<LoggedSet> = {}): LoggedSet {
  return {
    id: id('set'),
    session_exercise_id: 'session-exercise-1',
    user_id: 'test-user-id',
    set_index: 0,
    set_type: 'working',
    weight: 100,
    reps: 5,
    time_seconds: null,
    distance_meters: null,
    rpe: null,
    rir: null,
    is_pr: false,
    e1rm_kg: null,
    completed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as LoggedSet;
}

export function makeSessionExercise(overrides: Partial<SessionExerciseWithSets> = {}): SessionExerciseWithSets {
  const exercise = overrides.exercise ?? makeExercise();
  return {
    id: id('session-exercise'),
    session_id: 'session-1',
    user_id: 'test-user-id',
    exercise_id: exercise.id,
    order_index: 0,
    superset_group_id: null,
    rest_seconds: 90,
    target_reps_min: null,
    target_reps_max: null,
    created_at: new Date().toISOString(),
    sets: [],
    ...overrides,
    exercise,
  };
}

export function makeRoutineExercise(overrides: Partial<RoutineExerciseWithDetails> = {}): RoutineExerciseWithDetails {
  const exercise = overrides.exercise ?? makeExercise();
  return {
    id: id('routine-exercise'),
    routine_id: 'routine-1',
    user_id: 'test-user-id',
    exercise_id: exercise.id,
    order_index: 0,
    superset_group_id: null,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    target_weight: null,
    rest_seconds: 90,
    note: null,
    created_at: new Date().toISOString(),
    ...overrides,
    exercise,
  };
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'test-user-id',
    display_name: 'Test User',
    avatar_url: null,
    unit_preference: 'kg',
    weekly_goal_days: 3,
    timezone: 'UTC',
    progression_upper_increment_kg: 2.5,
    progression_lower_increment_kg: 5,
    progression_deload_pct: 10,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Profile;
}

export function makeCurrentBest(overrides: Partial<ExerciseCurrentBest> = {}): ExerciseCurrentBest {
  return {
    user_id: 'test-user-id',
    exercise_id: 'exercise-1',
    best_weight: null,
    best_weight_reps: null,
    best_weight_logged_set_id: null,
    best_weight_achieved_at: null,
    best_est_1rm: null,
    best_est_1rm_weight: null,
    best_est_1rm_reps: null,
    best_est_1rm_logged_set_id: null,
    best_est_1rm_achieved_at: null,
    best_set_weight: null,
    best_set_reps: null,
    best_set_volume: null,
    best_set_logged_set_id: null,
    best_set_achieved_at: null,
    last_session_exercise_id: null,
    last_session_completed_at: null,
    updated_at: new Date().toISOString(),
    ...overrides,
  } as ExerciseCurrentBest;
}

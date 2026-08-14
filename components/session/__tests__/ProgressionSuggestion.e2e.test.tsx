import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '@/lib/testing/renderWithProviders';
import { mockSupabaseResponse, mockSupabaseResponseOnce, resetSupabaseMock, supabaseMockCalls } from '@/lib/testing/supabaseMockState';
import { makeCurrentBest, makeExercise, makeLoggedSet, makeProfile, makeSessionExercise } from '@/lib/testing/fixtures';
import { useSessionExercises } from '@/hooks/useWorkoutSession';
import { ExerciseLogCard } from '../ExerciseLogCard';
import type { SessionExerciseWithSets } from '@/types/domain';

// M2 (Progression): the double-progression chip is advisory only (PRD 6.1.4 / ProgressionChip.tsx's own
// header comment) — tapping it must pre-fill the next draft weight and must NEVER log a set by itself.

jest.mock('../../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

const SESSION_ID = 'session-1';

function SessionExercisesHarness({ sessionId }: { sessionId: string }) {
  const { data: sessionExercises, isLoading } = useSessionExercises(sessionId);
  if (isLoading || !sessionExercises) return null;
  return (
    <>
      {sessionExercises.map((se) => (
        <ExerciseLogCard
          key={se.id}
          sessionExercise={se}
          sessionId={sessionId}
          unit="kg"
          onStartRest={() => {}}
          onRemove={() => {}}
          onRequestSwap={() => {}}
        />
      ))}
    </>
  );
}

function primeCommonFixtures(sessionExercise: SessionExerciseWithSets) {
  mockSupabaseResponse('session_exercises', { data: [sessionExercise], error: null });
  mockSupabaseResponse('profiles', { data: makeProfile({ progression_upper_increment_kg: 2.5 }), error: null });
}

beforeEach(() => {
  resetSupabaseMock();
});

it('suggests +upper-increment when every working set in the last session hit the top of the rep range, and accepting it only pre-fills — never auto-logs', async () => {
  const exercise = makeExercise({ id: 'exercise-1', name: 'Bench Press', category: 'push', tracking_type: 'weight_reps' });
  const sessionExercise = makeSessionExercise({
    id: 'se-1',
    session_id: SESSION_ID,
    exercise,
    sets: [],
    target_reps_min: 8,
    target_reps_max: 12,
  });
  primeCommonFixtures(sessionExercise);

  mockSupabaseResponse('exercise_current_best', {
    data: makeCurrentBest({
      exercise_id: exercise.id,
      last_session_exercise_id: 'prev-se-1',
      last_session_completed_at: '2026-08-01T00:00:00.000Z',
    }),
    error: null,
  });
  // Last session: single working set at 100kg for 12 reps — hits the top of the 8-12 target range.
  mockSupabaseResponse('logged_sets', {
    data: [makeLoggedSet({ session_exercise_id: 'prev-se-1', set_index: 0, set_type: 'working', weight: 100, reps: 12 })],
    error: null,
  });

  await renderWithProviders(<SessionExercisesHarness sessionId={SESSION_ID} />);

  await waitFor(() => expect(screen.getByText('Try +2.5kg today')).toBeTruthy());

  // Before accepting: draft still shows last time's raw weight, no delta applied yet.
  expect(screen.getByDisplayValue('100')).toBeTruthy();

  fireEvent.press(screen.getByText('Try +2.5kg today'));

  // Accepting pre-fills the draft with the suggested weight...
  await waitFor(() => expect(screen.getByDisplayValue('102.5')).toBeTruthy());

  // ...and does nothing else: no network write happened from the tap alone.
  expect(supabaseMockCalls.some((c) => c.table === 'logged_sets' && c.method === 'upsert')).toBe(false);
});

it('suggests nothing when the last session did not reach the top of the target rep range', async () => {
  const exercise = makeExercise({ id: 'exercise-2', name: 'Row', category: 'pull', tracking_type: 'weight_reps' });
  const sessionExercise = makeSessionExercise({
    id: 'se-2',
    session_id: SESSION_ID,
    exercise,
    sets: [],
    target_reps_min: 8,
    target_reps_max: 12,
  });
  primeCommonFixtures(sessionExercise);

  mockSupabaseResponse('exercise_current_best', {
    data: makeCurrentBest({ exercise_id: exercise.id, last_session_exercise_id: 'prev-se-2', last_session_completed_at: '2026-08-01T00:00:00.000Z' }),
    error: null,
  });
  // Only hit 9 reps last time — short of the top-of-range (12), so no "increase" suggestion.
  // Deload also can't fire yet: it requires two completed sessions and this fixture only serves one.
  mockSupabaseResponse('logged_sets', {
    data: [makeLoggedSet({ session_exercise_id: 'prev-se-2', set_index: 0, set_type: 'working', weight: 80, reps: 9 })],
    error: null,
  });

  await renderWithProviders(<SessionExercisesHarness sessionId={SESSION_ID} />);

  await waitFor(() => expect(screen.getByDisplayValue('80')).toBeTruthy());
  expect(screen.queryByText(/Try \+/)).toBeNull();
  expect(screen.queryByText(/deload/)).toBeNull();
});

it('suggests a deload when the last two completed sessions both missed the bottom of the target rep range', async () => {
  const exercise = makeExercise({ id: 'exercise-3', name: 'Overhead Press', category: 'push', tracking_type: 'weight_reps' });
  const sessionExercise = makeSessionExercise({
    id: 'se-3',
    session_id: SESSION_ID,
    exercise,
    sets: [],
    target_reps_min: 8,
    target_reps_max: 12,
  });
  mockSupabaseResponse('profiles', { data: makeProfile({ progression_deload_pct: 10 }), error: null });

  // useSessionExercises' initial list query fires first — one-shot response for that specific call.
  mockSupabaseResponseOnce('session_exercises', { data: [sessionExercise], error: null });

  mockSupabaseResponse('exercise_current_best', {
    data: makeCurrentBest({ exercise_id: exercise.id, last_session_exercise_id: 'prev-se-3', last_session_completed_at: '2026-08-01T00:00:00.000Z' }),
    error: null,
  });
  // Last session (drives the draft pre-fill and the deload delta's base weight): 80kg x 6 reps —
  // below target_reps_min (8), so it also doesn't hit the top of the range (no "increase" chip).
  mockSupabaseResponse('logged_sets', {
    data: [makeLoggedSet({ session_exercise_id: 'prev-se-3', set_index: 0, set_type: 'working', weight: 80, reps: 6 })],
    error: null,
  });
  // The deload lookback's own query also hits 'session_exercises' (nested join shape), but only
  // *after* the initial list query above has already consumed its one-shot response — this default
  // response is what every subsequent call falls back to. Two completed sessions, both missing the
  // bottom of the 8-rep-min range, is exactly what fn/useProgressionSuggestion's deload check requires.
  mockSupabaseResponse('session_exercises', {
    data: [
      { target_reps_min: 8, sets: [{ reps: 6, set_type: 'working' }], session: { started_at: '2026-08-08', status: 'completed' } },
      { target_reps_min: 8, sets: [{ reps: 5, set_type: 'working' }], session: { started_at: '2026-08-01', status: 'completed' } },
    ],
    error: null,
  });

  await renderWithProviders(<SessionExercisesHarness sessionId={SESSION_ID} />);

  // -round((80 * 10 / 100) * 2) / 2 = -8kg
  await waitFor(() => expect(screen.getByText('Consider -8kg (deload)')).toBeTruthy());
});

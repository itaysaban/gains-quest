import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders, createTestQueryClient } from '@/lib/testing/renderWithProviders';
import {
  mockSupabaseResponse,
  mockSupabaseResponseOnce,
  resetSupabaseMock,
  supabaseMockCalls,
} from '@/lib/testing/supabaseMockState';
import { makeCurrentBest, makeExercise, makeLoggedSet, makeProfile, makeSessionExercise } from '@/lib/testing/fixtures';
import { useSessionExercises } from '@/hooks/useWorkoutSession';
import { ExerciseLogCard } from '../ExerciseLogCard';
import type { SessionExerciseWithSets } from '@/types/domain';

// End-to-end coverage for README §5 "The core engine (M1 + M2)": the always-visible last-time row,
// single-tap draft logging with a client-generated id, and instant optimistic PR detection that the
// server later reconciles — driven through the real hooks (useSessionExercises, useLogSet,
// useExerciseCurrentBest, useLastSessionSets) and the real ExerciseLogCard/DraftSetRow/LastSessionRow/
// PrBadge component tree, exactly as app/session/active.tsx composes them (lines 42, 171-183).

// A relative path (not the `@/` alias) so Jest's own resolver can find the adjacent lib/__mocks__/
// folder without depending on how babel happens to rewrite alias imports elsewhere.
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

/** Mirrors app/session/active.tsx's composition (useSessionExercises -> ExerciseLogCard per row) without
 * the surrounding timer/picker/navigation chrome that's orthogonal to the logging flow under test. */
function SessionExercisesHarness({ sessionId, unit = 'kg' as const }: { sessionId: string; unit?: 'kg' | 'lb' }) {
  const { data: sessionExercises, isLoading } = useSessionExercises(sessionId);
  if (isLoading || !sessionExercises) return null;
  return (
    <>
      {sessionExercises.map((se) => (
        <ExerciseLogCard
          key={se.id}
          sessionExercise={se}
          sessionId={sessionId}
          unit={unit}
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
  mockSupabaseResponse('profiles', { data: makeProfile(), error: null });
}

beforeEach(() => {
  resetSupabaseMock();
});

describe('active session logging (M1 engine)', () => {
  it('shows the last-time row and pre-fills the draft from the previous session at the same set index', async () => {
    const exercise = makeExercise({ id: 'exercise-1', name: 'Bench Press' });
    const sessionExercise = makeSessionExercise({ id: 'se-1', session_id: SESSION_ID, exercise, sets: [] });
    primeCommonFixtures(sessionExercise);

    mockSupabaseResponse('exercise_current_best', {
      data: makeCurrentBest({
        exercise_id: exercise.id,
        last_session_exercise_id: 'prev-se-1',
        last_session_completed_at: '2026-08-01T00:00:00.000Z',
      }),
      error: null,
    });
    mockSupabaseResponse('logged_sets', {
      data: [makeLoggedSet({ session_exercise_id: 'prev-se-1', set_index: 0, weight: 100, reps: 5 })],
      error: null,
    });

    await renderWithProviders(<SessionExercisesHarness sessionId={SESSION_ID} />);

    // Last-time row: always-visible, reads the previous session's matching set.
    await waitFor(() => expect(screen.getByText(/100kg×5/)).toBeTruthy());

    // Draft pre-fill: the weight/reps inputs already show last time's numbers before any input.
    expect(screen.getByDisplayValue('100')).toBeTruthy();
    expect(screen.getByDisplayValue('5')).toBeTruthy();
  });

  it('shows "First time" when there is no prior session for this exercise', async () => {
    const exercise = makeExercise({ id: 'exercise-2', name: 'Overhead Press' });
    const sessionExercise = makeSessionExercise({ id: 'se-2', session_id: SESSION_ID, exercise, sets: [] });
    primeCommonFixtures(sessionExercise);
    mockSupabaseResponse('exercise_current_best', { data: null, error: null });

    await renderWithProviders(<SessionExercisesHarness sessionId={SESSION_ID} />);

    await waitFor(() => expect(screen.getByText('First time — set your baseline.')).toBeTruthy());
    // No prior session_exercise_id means useLastSessionSets never queries logged_sets at all.
    expect(supabaseMockCalls.some((c) => c.table === 'logged_sets')).toBe(false);
  });

  it('logs a set on a single tap, upserting a client-generated id (idempotent-safe write)', async () => {
    const exercise = makeExercise({ id: 'exercise-3', name: 'Deadlift' });
    const sessionExercise = makeSessionExercise({ id: 'se-3', session_id: SESSION_ID, exercise, sets: [] });
    primeCommonFixtures(sessionExercise);
    mockSupabaseResponse('exercise_current_best', { data: null, error: null });
    mockSupabaseResponseOnce('logged_sets', {
      data: makeLoggedSet({ session_exercise_id: sessionExercise.id, set_index: 0, weight: 0, reps: 0, is_pr: false }),
      error: null,
    });

    await renderWithProviders(<SessionExercisesHarness sessionId={SESSION_ID} />);
    await waitFor(() => expect(screen.getByText('First time — set your baseline.')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Increase Weight' }));
      fireEvent.press(screen.getByRole('button', { name: 'Increase Reps' }));
    });

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Log set' }));
    });

    const upsertCall = supabaseMockCalls.find((c) => c.table === 'logged_sets' && c.method === 'upsert');
    expect(upsertCall).toBeTruthy();
    const payload = upsertCall!.args[0] as { id: string; session_exercise_id: string };
    expect(payload.session_exercise_id).toBe(sessionExercise.id);
    expect(typeof payload.id).toBe('string');
    expect(payload.id.length).toBeGreaterThan(0); // client-generated — never left for the server to assign
  });

  it('flags a PR the instant a set beating the current best is logged, before the server responds', async () => {
    const exercise = makeExercise({ id: 'exercise-4', name: 'Squat' });
    const sessionExercise = makeSessionExercise({ id: 'se-4', session_id: SESSION_ID, exercise, sets: [] });
    primeCommonFixtures(sessionExercise);
    mockSupabaseResponse('exercise_current_best', {
      data: makeCurrentBest({
        exercise_id: exercise.id,
        best_weight: 100,
        best_est_1rm: 116.7,
        last_session_exercise_id: 'prev-se-4',
        last_session_completed_at: '2026-08-01T00:00:00.000Z',
      }),
      error: null,
    });
    // Draft pre-fills from this — 100kg × 5, same as the current best — so a single +2.5kg nudge is
    // enough to beat it.
    mockSupabaseResponse('logged_sets', {
      data: [makeLoggedSet({ session_exercise_id: 'prev-se-4', set_index: 0, set_type: 'working', weight: 100, reps: 5 })],
      error: null,
    });

    // Server takes its time to actually reply — the assertion below must hold before it ever does.
    let resolveUpsert!: (v: { data: unknown; error: null }) => void;
    const queryClient = createTestQueryClient();

    await renderWithProviders(<SessionExercisesHarness sessionId={SESSION_ID} />, { queryClient });
    await waitFor(() => expect(screen.getByDisplayValue('100')).toBeTruthy());

    // Nudge weight to 102.5kg (> currentBest 100kg) via the adjuster (step is 2.5kg) and log a working set.
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Increase Weight' }));
    });

    const pendingUpsert = new Promise<{ data: unknown; error: null }>((resolve) => {
      resolveUpsert = resolve;
    });
    mockSupabaseResponseOnce('logged_sets', pendingUpsert as unknown as { data: unknown; error: null });

    fireEvent.press(screen.getByRole('button', { name: 'Log set' }));

    // Optimistic PR toast appears immediately — the mocked server call above hasn't resolved yet.
    await waitFor(() => expect(screen.getByText(/New PR — Squat!/)).toBeTruthy());

    resolveUpsert({
      data: makeLoggedSet({ session_exercise_id: sessionExercise.id, weight: 102.5, reps: 5, is_pr: true }),
      error: null,
    });
  });
});

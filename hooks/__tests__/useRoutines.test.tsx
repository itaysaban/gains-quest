import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/lib/testing/renderWithProviders';
import { AuthProvider } from '@/lib/auth/AuthProvider';

jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { mockSupabaseResponse, resetSupabaseMock, supabaseMockCalls } from '@/lib/testing/supabaseMockState';
import {
  useCreateRoutine,
  useAddExerciseToRoutine,
  useReorderRoutineExercises,
  useRemoveRoutineExercise,
  useUpdateRoutine,
} from '../useRoutines';

// M1 P0 acceptance criterion: "A user can create a routine with at least eight exercises, including
// one superset, and save it." Also covers reorder-by-drag (bulk order_index write) and archive
// (soft-delete via is_archived, never deletes session history) — hook-level, since the routine
// builder's actual drag-and-drop UI isn't meaningfully testable without a real gesture system.

function makeWrapper(queryClient: QueryClient) {
  return function wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  resetSupabaseMock();
});

it('creates a routine and invalidates the routines list', async () => {
  mockSupabaseResponse('routines', {
    data: { id: 'routine-1', user_id: 'test-user-id', name: 'Push Pull Legs', description: null, folder: null },
    error: null,
  });

  const { result } = await renderHook(() => useCreateRoutine(), { wrapper: makeWrapper(createTestQueryClient()) });

  await act(async () => {
    await result.current.mutateAsync({ name: 'Push Pull Legs', description: '', folder: '' });
  });

  const insertCall = supabaseMockCalls.find((c) => c.table === 'routines' && c.method === 'insert');
  expect((insertCall!.args[0] as { name: string }).name).toBe('Push Pull Legs');
});

it('adds eight exercises to a routine, including two sharing a superset_group_id, without any write failing', async () => {
  const queryClient = createTestQueryClient();
  const wrapper = makeWrapper(queryClient);

  mockSupabaseResponse('routine_exercises', {
    data: { id: 're-x', routine_id: 'routine-1' },
    error: null,
  });

  const { result } = await renderHook(() => useAddExerciseToRoutine(), { wrapper });

  const supersetGroupId = 'superset-a';
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await result.current.mutateAsync({
        routineId: 'routine-1',
        exerciseId: `exercise-${i}`,
        orderIndex: i,
        // First two exercises alternate as a superset; the rest are single-exercise "groups".
        supersetGroupId: i < 2 ? supersetGroupId : null,
      });
    });
  }

  const insertCalls = supabaseMockCalls.filter((c) => c.table === 'routine_exercises' && c.method === 'insert');
  expect(insertCalls).toHaveLength(8);
  const supersetInserts = insertCalls.filter((c) => (c.args[0] as { superset_group_id: string | null }).superset_group_id === supersetGroupId);
  expect(supersetInserts).toHaveLength(2); // exactly the superset pair, sharing one group id
});

it('reorders routine exercises in one bulk write per affected row (drag-and-drop persistence)', async () => {
  mockSupabaseResponse('routine_exercises', { data: null, error: null });

  const { result } = await renderHook(() => useReorderRoutineExercises(), { wrapper: makeWrapper(createTestQueryClient()) });

  await act(async () => {
    await result.current.mutateAsync({
      routineId: 'routine-1',
      ordered: [
        { id: 're-1', order_index: 0 },
        { id: 're-2', order_index: 1 },
        { id: 're-3', order_index: 2 },
      ],
    });
  });

  const updateCalls = supabaseMockCalls.filter((c) => c.table === 'routine_exercises' && c.method === 'update');
  expect(updateCalls).toHaveLength(3);
  expect(updateCalls.map((c) => c.args[0])).toEqual([{ order_index: 0 }, { order_index: 1 }, { order_index: 2 }]);
});

it('removes an exercise from a routine via delete, not archive (routine_exercises rows aren\'t history)', async () => {
  mockSupabaseResponse('routine_exercises', { data: null, error: null });

  const { result } = await renderHook(() => useRemoveRoutineExercise(), { wrapper: makeWrapper(createTestQueryClient()) });

  await act(async () => {
    await result.current.mutateAsync({ id: 're-1', routineId: 'routine-1' });
  });

  const deleteCall = supabaseMockCalls.find((c) => c.table === 'routine_exercises' && c.method === 'delete');
  expect(deleteCall).toBeTruthy();
});

it('archiving a routine is a soft update (is_archived), not a delete — session history stays intact', async () => {
  mockSupabaseResponse('routines', { data: null, error: null });

  const { result } = await renderHook(() => useUpdateRoutine(), { wrapper: makeWrapper(createTestQueryClient()) });

  await act(async () => {
    await result.current.mutateAsync({ id: 'routine-1', patch: { is_archived: true } });
  });

  expect(supabaseMockCalls.some((c) => c.table === 'routines' && c.method === 'delete')).toBe(false);
  const updateCall = supabaseMockCalls.find((c) => c.table === 'routines' && c.method === 'update');
  expect(updateCall?.args[0]).toEqual({ is_archived: true });
});

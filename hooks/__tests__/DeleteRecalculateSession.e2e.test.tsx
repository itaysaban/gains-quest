import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/lib/testing/renderWithProviders';

jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { mockSupabaseResponse, resetSupabaseMock, supabaseMockCalls } from '@/lib/testing/supabaseMockState';
import { useDeleteCompletedSession, useRecalculateSessionPoints } from '../useWorkoutSession';

// M3 Epic 1 Story 1.5 (FR10/FR11): points reversal on delete, recalculation on edit. No screen
// calls these yet (no delete/edit-a-past-workout UI exists), so this only verifies the client-side
// plumbing to the RPCs — the actual reversal/recalculation math lives in Postgres
// (fn_reverse_session_points / fn_award_points_for_session) and isn't testable without a live
// database; it was hand-verified against the migration's own logic instead.

function makeWrapper(queryClient: QueryClient) {
  return function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  resetSupabaseMock();
});

it('useDeleteCompletedSession calls fn_delete_completed_session with the session id', async () => {
  mockSupabaseResponse('rpc:fn_delete_completed_session', { data: null, error: null });

  const { result } = await renderHook(() => useDeleteCompletedSession(), { wrapper: makeWrapper(createTestQueryClient()) });

  await act(async () => {
    await result.current.mutateAsync('session-1');
  });

  const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_delete_completed_session');
  expect(rpcCall?.args[0]).toEqual({ p_session_id: 'session-1' });
});

it('useDeleteCompletedSession surfaces a server rejection (e.g. session not completed) as an error', async () => {
  mockSupabaseResponse('rpc:fn_delete_completed_session', {
    data: null,
    error: { message: 'Only a completed session can be deleted this way — use discard for an in-progress one' },
  });

  const { result } = await renderHook(() => useDeleteCompletedSession(), { wrapper: makeWrapper(createTestQueryClient()) });

  await expect(result.current.mutateAsync('session-1')).rejects.toBeTruthy();
});

it('useRecalculateSessionPoints calls fn_recalculate_session_points and returns the new point total', async () => {
  mockSupabaseResponse('rpc:fn_recalculate_session_points', { data: 75, error: null });

  const { result } = await renderHook(() => useRecalculateSessionPoints(), { wrapper: makeWrapper(createTestQueryClient()) });

  let returned: number | undefined;
  await act(async () => {
    returned = await result.current.mutateAsync('session-1');
  });

  const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_recalculate_session_points');
  expect(rpcCall?.args[0]).toEqual({ p_session_id: 'session-1' });
  expect(returned).toBe(75);
});

it('useRecalculateSessionPoints surfaces the server\'s 48-hour-window rejection as an error', async () => {
  mockSupabaseResponse('rpc:fn_recalculate_session_points', {
    data: null,
    error: { message: 'Session was completed more than 48 hours ago — recalculation window has passed' },
  });

  const { result } = await renderHook(() => useRecalculateSessionPoints(), { wrapper: makeWrapper(createTestQueryClient()) });

  await expect(result.current.mutateAsync('session-1')).rejects.toBeTruthy();
});

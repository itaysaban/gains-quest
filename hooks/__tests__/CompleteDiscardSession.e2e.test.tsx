import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';

jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/lib/testing/renderWithProviders';
import { mockSupabaseResponse, resetSupabaseMock, supabaseMockCalls } from '@/lib/testing/supabaseMockState';
import { useSessionStore } from '@/store/sessionStore';
import { useCompleteSession, useDiscardSession } from '../useWorkoutSession';

// M1/M2 finishing move: fn_complete_session is the single server-authoritative RPC that awards
// GainPoints, resolves PRs/badges, and (per the hook's onSuccess) must clear the local
// in-progress-session state and invalidate every screen that depends on it. Discard is the sibling
// "abandon without crediting anything" path — both must leave the local session store clean afterward.

// Built once per test and closed over — a wrapper that creates its QueryClient inline would mint a
// fresh one on every re-render, discarding the very mutation state (result.current.data) the test
// asserts on.
function makeWrapper(queryClient: QueryClient) {
  return function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  resetSupabaseMock();
  useSessionStore.getState().startSession('session-1', 'routine-1');
});

afterEach(() => {
  useSessionStore.getState().endSession();
});

it('useCompleteSession calls fn_complete_session with the session id and clears the local session store on success', async () => {
  const rpcResult = {
    duration_seconds: 1800,
    total_volume: 4500,
    total_sets: 12,
    points_earned: 55,
    prs: [{ exercise_id: 'exercise-1', record_type: 'weight' }],
    new_badges: [{ code: 'first-100kg', name: 'First 100kg', icon: '🏋️', category: 'strength' }],
  };
  // Completing first snapshots quest progress (the baseline the Quest Progress screen diffs against),
  // so this RPC is hit before fn_complete_session — irrelevant to what this test asserts, but it has
  // to be primed or the mock throws.
  mockSupabaseResponse('rpc:fn_active_challenges', { data: [], error: null });
  mockSupabaseResponse('rpc:fn_complete_session', { data: rpcResult, error: null });

  const { result } = await renderHook(() => useCompleteSession(), { wrapper: makeWrapper(createTestQueryClient()) });

  await act(async () => {
    await result.current.mutateAsync('session-1');
  });

  const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_complete_session');
  expect(rpcCall?.args[0]).toEqual({ p_session_id: 'session-1' });
  expect(result.current.data).toEqual(rpcResult);
  expect(result.current.data?.points_earned).toBe(55);

  await waitFor(() => expect(useSessionStore.getState().sessionId).toBeNull());
});

it('useDiscardSession marks the session discarded without touching points/badges, and clears the local session store', async () => {
  mockSupabaseResponse('workout_sessions', { data: null, error: null });

  const { result } = await renderHook(() => useDiscardSession(), { wrapper: makeWrapper(createTestQueryClient()) });

  await act(async () => {
    await result.current.mutateAsync('session-1');
  });

  const updateCall = supabaseMockCalls.find((c) => c.table === 'workout_sessions' && c.method === 'update');
  expect(updateCall?.args[0]).toEqual({ status: 'discarded' });
  expect(supabaseMockCalls.some((c) => c.table.startsWith('rpc:'))).toBe(false);

  await waitFor(() => expect(useSessionStore.getState().sessionId).toBeNull());
});

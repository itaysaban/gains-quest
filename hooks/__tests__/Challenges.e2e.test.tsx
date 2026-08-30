import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/lib/testing/renderWithProviders';
import { AuthProvider } from '@/lib/auth/AuthProvider';

jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { mockSupabaseResponse, mockSupabaseResponseOnce, resetSupabaseMock, supabaseMockCalls, defaultMockSession } from '@/lib/testing/supabaseMockState';
import { useSessionStore } from '@/store/sessionStore';
import { useActiveChallenges } from '../useChallenges';
import { useCompleteSession } from '../useWorkoutSession';

// M4 Story 4: assignment, progress computation, and the exactly-once GP award are already verified
// against a live Postgres project (16 scenario tests, test-epic7.js in the scratchpad harness). This
// covers the client's plumbing: the right user id reaches fn_active_challenges and the response
// shape flows through untouched.

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

it('calls fn_active_challenges with the current user id and returns the rows untouched', async () => {
  mockSupabaseResponse('rpc:fn_active_challenges', {
    data: [
      {
        id: 'uc-1',
        code: 'weekly_3_sessions',
        name: 'Get Moving',
        description: 'Complete 3 workouts this week',
        metric: 'sessions_completed',
        target_value: 3,
        progress_value: 2,
        status: 'active',
        points: 150,
        period_end: '2026-08-23',
      },
    ],
    error: null,
  });

  const { result } = await renderHook(() => useActiveChallenges(), { wrapper: makeWrapper(createTestQueryClient()) });

  await waitFor(() => expect(result.current.data).toBeDefined());
  const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_active_challenges');
  expect(rpcCall?.args[0]).toEqual({ p_user_id: defaultMockSession.user.id });
  expect(result.current.data?.[0].progress_value).toBe(2);
  expect(result.current.data?.[0].status).toBe('active');
});

it('surfaces an RPC error rather than silently returning undefined', async () => {
  mockSupabaseResponse('rpc:fn_active_challenges', { data: null, error: { message: 'boom' } });

  const { result } = await renderHook(() => useActiveChallenges(), { wrapper: makeWrapper(createTestQueryClient()) });

  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBeUndefined();
});

// Regression test for a reported bug: challenge progress on Add Workout / Session Summary only
// updated after reloading the app, never right after finishing a workout, because useCompleteSession
// wasn't invalidating the active-challenges query. Verified by observing a real refetch (a second
// fn_active_challenges call, returning updated progress) after useCompleteSession succeeds, not just
// by asserting invalidateQueries was called.
it('completing a session invalidates active-challenges so it refetches with updated progress', async () => {
  useSessionStore.getState().startSession('session-1', null);
  mockSupabaseResponseOnce('rpc:fn_active_challenges', {
    data: [{ id: 'uc-1', code: 'weekly_3_sessions', name: 'Get Moving', description: 'Complete 3 workouts this week', metric: 'sessions_completed', target_value: 3, progress_value: 1, status: 'active', points: 150, period_end: '2026-08-23' }],
    error: null,
  });
  mockSupabaseResponseOnce('rpc:fn_active_challenges', {
    data: [{ id: 'uc-1', code: 'weekly_3_sessions', name: 'Get Moving', description: 'Complete 3 workouts this week', metric: 'sessions_completed', target_value: 3, progress_value: 2, status: 'active', points: 150, period_end: '2026-08-23' }],
    error: null,
  });
  mockSupabaseResponse('rpc:fn_complete_session', {
    data: { duration_seconds: 1800, total_volume: 1000, total_sets: 5, points_earned: 50, prs: [], new_badges: [] },
    error: null,
  });

  const queryClient = createTestQueryClient();
  const wrapper = makeWrapper(queryClient);
  const { result: challenges } = await renderHook(() => useActiveChallenges(), { wrapper });
  await waitFor(() => expect(challenges.current.data?.[0].progress_value).toBe(1));

  const { result: complete } = await renderHook(() => useCompleteSession(), { wrapper });
  await act(async () => {
    await complete.current.mutateAsync('session-1');
  });

  await waitFor(() => expect(challenges.current.data?.[0].progress_value).toBe(2));
  const rpcCalls = supabaseMockCalls.filter((c) => c.table === 'rpc:fn_active_challenges');
  expect(rpcCalls.length).toBe(2);

  useSessionStore.getState().endSession();
});

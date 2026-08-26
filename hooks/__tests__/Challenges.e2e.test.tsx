import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/lib/testing/renderWithProviders';
import { AuthProvider } from '@/lib/auth/AuthProvider';

jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { mockSupabaseResponse, resetSupabaseMock, supabaseMockCalls, defaultMockSession } from '@/lib/testing/supabaseMockState';
import { useActiveChallenges } from '../useChallenges';

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

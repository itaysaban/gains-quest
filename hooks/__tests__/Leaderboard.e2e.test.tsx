import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/lib/testing/renderWithProviders';
import { AuthProvider } from '@/lib/auth/AuthProvider';

jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { mockSupabaseResponse, resetSupabaseMock, supabaseMockCalls } from '@/lib/testing/supabaseMockState';
import { useLeaderboard } from '../useGamification';

// M4 Story 2: ranking correctness (tiering, season scoping, friends-only inclusion) is already
// verified against a live Postgres project (22 scenario tests, test-epic5.js in the scratchpad
// harness). This covers the client's plumbing: the right scope argument reaches fn_leaderboard.

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

it('calls fn_leaderboard with the global scope', async () => {
  mockSupabaseResponse('rpc:fn_leaderboard', {
    data: [{ rank: 1, user_id: 'test-user-id', display_name: 'Me', avatar_url: null, season_gp: 500, is_self: true, tier_number: 1, tier_size: 12 }],
    error: null,
  });

  const { result } = await renderHook(() => useLeaderboard('global'), { wrapper: makeWrapper(createTestQueryClient()) });

  await waitFor(() => expect(result.current.data).toBeDefined());
  const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_leaderboard');
  expect(rpcCall?.args[0]).toEqual({ p_scope: 'global' });
  expect(result.current.data?.[0].tier_number).toBe(1);
});

it('calls fn_leaderboard with the friends scope', async () => {
  mockSupabaseResponse('rpc:fn_leaderboard', {
    data: [{ rank: 1, user_id: 'test-user-id', display_name: 'Me', avatar_url: null, season_gp: 100, is_self: true, tier_number: null, tier_size: null }],
    error: null,
  });

  const { result } = await renderHook(() => useLeaderboard('friends'), { wrapper: makeWrapper(createTestQueryClient()) });

  await waitFor(() => expect(result.current.data).toBeDefined());
  const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_leaderboard');
  expect(rpcCall?.args[0]).toEqual({ p_scope: 'friends' });
  expect(result.current.data?.[0].tier_number).toBeNull();
});

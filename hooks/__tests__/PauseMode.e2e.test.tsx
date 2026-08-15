import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/lib/testing/renderWithProviders';

jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { mockSupabaseResponse, resetSupabaseMock, supabaseMockCalls } from '@/lib/testing/supabaseMockState';
import { useEnablePauseMode } from '../useGamification';

// M3 Epic 2 Story 2.5: verifies the client-side plumbing to fn_enable_pause_mode. The clamping
// (over-request -> remaining quarter budget) and the hold-the-counter behavior live in
// fn_update_streak/fn_enable_pause_mode in Postgres and aren't testable without a live database —
// hand-verified against the migration's own logic instead.

function makeWrapper(queryClient: QueryClient) {
  return function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  resetSupabaseMock();
});

it('useEnablePauseMode calls fn_enable_pause_mode with the requested day count', async () => {
  mockSupabaseResponse('rpc:fn_enable_pause_mode', {
    data: { paused_until: '2026-08-20', days_granted: 7, days_remaining_this_quarter: 7 },
    error: null,
  });

  const { result } = await renderHook(() => useEnablePauseMode(), { wrapper: makeWrapper(createTestQueryClient()) });

  let returned: { paused_until: string; days_granted: number; days_remaining_this_quarter: number } | undefined;
  await act(async () => {
    returned = await result.current.mutateAsync(7);
  });

  const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_enable_pause_mode');
  expect(rpcCall?.args[0]).toEqual({ p_days: 7 });
  expect(returned).toEqual({ paused_until: '2026-08-20', days_granted: 7, days_remaining_this_quarter: 7 });
});

it('useEnablePauseMode reflects the server clamping an over-request to the remaining quota', async () => {
  mockSupabaseResponse('rpc:fn_enable_pause_mode', {
    data: { paused_until: '2026-08-18', days_granted: 4, days_remaining_this_quarter: 0 },
    error: null,
  });

  const { result } = await renderHook(() => useEnablePauseMode(), { wrapper: makeWrapper(createTestQueryClient()) });

  let returned: { paused_until: string; days_granted: number; days_remaining_this_quarter: number } | undefined;
  await act(async () => {
    returned = await result.current.mutateAsync(8);
  });

  expect(returned?.days_granted).toBe(4);
  expect(returned?.days_remaining_this_quarter).toBe(0);
});

it('useEnablePauseMode surfaces a server rejection (e.g. no pause days left) as an error', async () => {
  mockSupabaseResponse('rpc:fn_enable_pause_mode', {
    data: null,
    error: { message: 'No pause days remaining this quarter' },
  });

  const { result } = await renderHook(() => useEnablePauseMode(), { wrapper: makeWrapper(createTestQueryClient()) });

  await expect(result.current.mutateAsync(3)).rejects.toBeTruthy();
});

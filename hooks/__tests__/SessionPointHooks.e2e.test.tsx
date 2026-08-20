import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/lib/testing/renderWithProviders';
import { AuthProvider } from '@/lib/auth/AuthProvider';

jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { mockSupabaseResponse, resetSupabaseMock, supabaseMockCalls } from '@/lib/testing/supabaseMockState';
import { useSessionPointBreakdown, useTodayPointsEarned, useSessionPoints } from '../useGamification';

// Session Summary and past-session detail both read GainPoints straight from point_ledger, never a
// stored total (PRD §8: "Point totals are always derived from point_ledger, never stored as a
// mutable counter"). These hooks are the client's only read path onto that ledger.

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  resetSupabaseMock();
});

describe('useSessionPointBreakdown', () => {
  it('sums multiple rows of the same source into one entry', async () => {
    mockSupabaseResponse('point_ledger', {
      data: [
        { source: 'volume', points: 50 },
        { source: 'volume', points: 25 },
        { source: 'pr', points: 100 },
      ],
      error: null,
    });

    const { result } = await renderHook(() => useSessionPointBreakdown('session-1'), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual([
      { source: 'volume', points: 75 },
      { source: 'pr', points: 100 },
    ]);
  });

  it('drops a source whose net sum is exactly 0 — an award fully offset by its own reversal', async () => {
    mockSupabaseResponse('point_ledger', {
      data: [
        { source: 'base', points: 50 },
        { source: 'base', points: -50 },
        { source: 'pr', points: 100 },
      ],
      error: null,
    });

    const { result } = await renderHook(() => useSessionPointBreakdown('session-1'), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual([{ source: 'pr', points: 100 }]);
  });

  it('stays disabled — fires no query — when sessionId is undefined', async () => {
    await renderHook(() => useSessionPointBreakdown(undefined), { wrapper });

    expect(supabaseMockCalls.some((c) => c.table === 'point_ledger')).toBe(false);
  });
});

describe('useTodayPointsEarned', () => {
  it('sums every returned row into one total', async () => {
    mockSupabaseResponse('point_ledger', {
      data: [{ points: 50 }, { points: 12 }, { points: 25 }],
      error: null,
    });

    const { result } = await renderHook(() => useTodayPointsEarned(), { wrapper });

    await waitFor(() => expect(result.current.data).toBe(87));
  });

  it('scopes the query to the current user, session-sourced categories only, and today', async () => {
    mockSupabaseResponse('point_ledger', { data: [], error: null });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    await renderHook(() => useTodayPointsEarned(), { wrapper });

    await waitFor(() => expect(supabaseMockCalls.some((c) => c.table === 'point_ledger')).toBe(true));
    const calls = supabaseMockCalls.filter((c) => c.table === 'point_ledger');

    expect(calls.find((c) => c.method === 'eq')?.args).toEqual(['user_id', 'test-user-id']);
    // 'achievement' GP is exempt from the daily ceiling (PRD §6.2) and must not be counted here.
    expect(calls.find((c) => c.method === 'in')?.args).toEqual(['source', ['base', 'volume', 'cardio', 'pr', 'routine']]);
    expect(calls.find((c) => c.method === 'gte')?.args).toEqual(['created_at', todayStart.toISOString()]);
  });
});

describe('useSessionPoints', () => {
  it('sums all point_ledger rows for a session regardless of source', async () => {
    mockSupabaseResponse('point_ledger', {
      data: [{ points: 50 }, { points: 100 }, { points: 25 }],
      error: null,
    });

    const { result } = await renderHook(() => useSessionPoints('session-1'), { wrapper });

    await waitFor(() => expect(result.current.data).toBe(175));
  });

  it('returns 0 for a session with no point_ledger rows', async () => {
    mockSupabaseResponse('point_ledger', { data: [], error: null });

    const { result } = await renderHook(() => useSessionPoints('session-1'), { wrapper });

    await waitFor(() => expect(result.current.data).toBe(0));
  });
});

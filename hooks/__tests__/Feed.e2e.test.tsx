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
import { useFriendFeed, useToggleReaction } from '../useFeed';
import type { FeedEvent } from '@/types/domain';

const userId = defaultMockSession.user.id;
const feedQueryKey = ['friend-feed', userId];

// M4 Story 3: event shape, PR/badge event generation, and privacy-safe metadata are already
// verified against a live Postgres project (22 scenario tests, test-epic6.js in the scratchpad
// harness). This covers the client's plumbing: pagination cursoring and optimistic reactions.

function makeWrapper(queryClient: QueryClient) {
  return function wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

function makeEvent(overrides: Partial<FeedEvent>): FeedEvent {
  return {
    id: 'event-1',
    user_id: 'friend-id',
    display_name: 'Friend',
    avatar_url: null,
    event_type: 'session_completed',
    metadata: { duration_seconds: 1800, total_sets: 10, workout_type: 'strength' },
    badge_code: null,
    badge_name: null,
    badge_icon: null,
    created_at: '2026-08-20T10:00:00.000Z',
    reaction_count: 0,
    reacted_by_me: false,
    ...overrides,
  };
}

beforeEach(() => {
  resetSupabaseMock();
});

it('fetches the first page with p_before null', async () => {
  mockSupabaseResponse('rpc:fn_friend_feed', { data: [makeEvent({ id: 'a' })], error: null });

  const { result } = await renderHook(() => useFriendFeed(), { wrapper: makeWrapper(createTestQueryClient()) });

  await waitFor(() => expect(result.current.data).toBeDefined());
  const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_friend_feed');
  expect(rpcCall?.args[0]).toEqual({ p_limit: 20, p_before: null });
  expect(result.current.data?.pages[0][0].id).toBe('a');
});

it('reports hasNextPage when a full page comes back, and fetches the next page using the last row\'s created_at as p_before', async () => {
  const fullPage = Array.from({ length: 20 }, (_, i) => makeEvent({ id: `p1-${i}`, created_at: `2026-08-20T10:${String(i).padStart(2, '0')}:00.000Z` }));
  mockSupabaseResponseOnce('rpc:fn_friend_feed', { data: fullPage, error: null });
  mockSupabaseResponseOnce('rpc:fn_friend_feed', { data: [makeEvent({ id: 'p2-0' })], error: null });

  const { result } = await renderHook(() => useFriendFeed(), { wrapper: makeWrapper(createTestQueryClient()) });

  await waitFor(() => expect(result.current.data).toBeDefined());
  expect(result.current.hasNextPage).toBe(true);

  await act(async () => {
    await result.current.fetchNextPage();
  });

  await waitFor(() => expect(result.current.data?.pages.length).toBe(2));
  const calls = supabaseMockCalls.filter((c) => c.table === 'rpc:fn_friend_feed');
  expect(calls[1].args[0]).toEqual({ p_limit: 20, p_before: fullPage[19].created_at });
  expect(result.current.data?.pages[1][0].id).toBe('p2-0');
});

it('reports no next page when a short page comes back', async () => {
  mockSupabaseResponse('rpc:fn_friend_feed', { data: [makeEvent({ id: 'only-one' })], error: null });

  const { result } = await renderHook(() => useFriendFeed(), { wrapper: makeWrapper(createTestQueryClient()) });

  await waitFor(() => expect(result.current.data).toBeDefined());
  expect(result.current.hasNextPage).toBe(false);
});

function seedFeedCache(queryClient: QueryClient, event: FeedEvent) {
  queryClient.setQueryData(feedQueryKey, { pages: [[event]], pageParams: [null] });
}

it('useToggleReaction optimistically flips reacted_by_me and reaction_count before the RPC resolves', async () => {
  mockSupabaseResponse('rpc:fn_toggle_reaction', { data: true, error: null });

  const queryClient = createTestQueryClient();
  seedFeedCache(queryClient, makeEvent({ id: 'event-1', reacted_by_me: false, reaction_count: 0 }));
  const wrapper = makeWrapper(queryClient);

  const { result } = await renderHook(() => useToggleReaction(), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });

  await act(async () => {
    result.current.mutate('event-1');
    await Promise.resolve();
  });

  // Assert in the same tick mutate() was called: onMutate runs synchronously before the (mocked,
  // async) network call resolves, so the cache must already reflect the reaction here.
  const event = queryClient.getQueryData<{ pages: FeedEvent[][] }>(feedQueryKey)?.pages[0][0];
  expect(event?.reacted_by_me).toBe(true);
  expect(event?.reaction_count).toBe(1);

  const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_toggle_reaction');
  expect(rpcCall?.args[0]).toEqual({ p_feed_event_id: 'event-1' });
});

it('useToggleReaction rolls back the optimistic update on error', async () => {
  mockSupabaseResponse('rpc:fn_toggle_reaction', { data: null, error: { message: 'Not authorized' } });

  const queryClient = createTestQueryClient();
  seedFeedCache(queryClient, makeEvent({ id: 'event-1', reacted_by_me: false, reaction_count: 0 }));
  const wrapper = makeWrapper(queryClient);

  const { result } = await renderHook(() => useToggleReaction(), { wrapper });
  await act(async () => {
    await Promise.resolve();
  });

  await act(async () => {
    try {
      await result.current.mutateAsync('event-1');
    } catch {
      // expected
    }
  });

  const event = queryClient.getQueryData<{ pages: FeedEvent[][] }>(feedQueryKey)?.pages[0][0];
  expect(event?.reacted_by_me).toBe(false);
  expect(event?.reaction_count).toBe(0);
});

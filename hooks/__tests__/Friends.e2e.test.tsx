import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/lib/testing/renderWithProviders';
import { AuthProvider } from '@/lib/auth/AuthProvider';

jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { mockSupabaseResponse, resetSupabaseMock, supabaseMockCalls } from '@/lib/testing/supabaseMockState';
import { useSearchUsers, useFriends, usePendingFriendRequests, useSendFriendRequest, useRespondFriendRequest, useRemoveFriend } from '../useFriends';

// M4 Story 1: server-side behavior (self/duplicate/unauthorized rejections, symmetric friend lists,
// Social Butterfly unlocking at 5) is already verified against a live Postgres project (34 scenario
// tests, test-epic4.js in the scratchpad harness). This covers the client's plumbing onto that RPC
// surface: correct args, correct query gating, correct cache invalidation.

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

describe('useSearchUsers', () => {
  it('stays disabled — fires no query — for a query under 2 characters', async () => {
    await renderHook(() => useSearchUsers('a'), { wrapper: makeWrapper(createTestQueryClient()) });

    expect(supabaseMockCalls.some((c) => c.table === 'rpc:fn_search_users')).toBe(false);
  });

  it('searches once the query reaches 2 characters, trimmed', async () => {
    mockSupabaseResponse('rpc:fn_search_users', {
      data: [{ id: 'user-2', display_name: 'Bob', avatar_url: null, relationship: 'none' }],
      error: null,
    });

    const { result } = await renderHook(() => useSearchUsers('  bo  '), { wrapper: makeWrapper(createTestQueryClient()) });

    await waitFor(() => expect(result.current.data).toBeDefined());
    const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_search_users');
    expect(rpcCall?.args[0]).toEqual({ p_query: 'bo' });
    expect(result.current.data).toEqual([{ id: 'user-2', display_name: 'Bob', avatar_url: null, relationship: 'none' }]);
  });
});

describe('useFriends', () => {
  it('calls fn_list_friends with the current user id', async () => {
    mockSupabaseResponse('rpc:fn_list_friends', {
      data: [{ id: 'friend-1', display_name: 'Ada', avatar_url: null, friends_since: '2026-08-01T00:00:00Z' }],
      error: null,
    });

    const { result } = await renderHook(() => useFriends(), { wrapper: makeWrapper(createTestQueryClient()) });

    await waitFor(() => expect(result.current.data).toBeDefined());
    const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_list_friends');
    expect(rpcCall?.args[0]).toEqual({ p_user_id: 'test-user-id' });
    expect(result.current.data?.[0].display_name).toBe('Ada');
  });
});

describe('usePendingFriendRequests', () => {
  it('calls fn_pending_friend_requests with the current user id', async () => {
    mockSupabaseResponse('rpc:fn_pending_friend_requests', {
      data: [{ id: 'req-1', from_user_id: 'user-3', display_name: 'Cy', avatar_url: null, created_at: '2026-08-18T00:00:00Z' }],
      error: null,
    });

    const { result } = await renderHook(() => usePendingFriendRequests(), { wrapper: makeWrapper(createTestQueryClient()) });

    await waitFor(() => expect(result.current.data).toBeDefined());
    const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_pending_friend_requests');
    expect(rpcCall?.args[0]).toEqual({ p_user_id: 'test-user-id' });
    expect(result.current.data?.[0].from_user_id).toBe('user-3');
  });
});

describe('useSendFriendRequest', () => {
  it('calls fn_send_friend_request with the addressee id', async () => {
    mockSupabaseResponse('rpc:fn_send_friend_request', {
      data: { id: 'req-1', requester_id: 'test-user-id', addressee_id: 'user-2', status: 'pending', created_at: '2026-08-18T00:00:00Z', responded_at: null },
      error: null,
    });

    const { result } = await renderHook(() => useSendFriendRequest(), { wrapper: makeWrapper(createTestQueryClient()) });

    let returned;
    await act(async () => {
      returned = await result.current.mutateAsync('user-2');
    });

    const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_send_friend_request');
    expect(rpcCall?.args[0]).toEqual({ p_addressee_id: 'user-2' });
    expect((returned as any).status).toBe('pending');
  });
});

describe('useRespondFriendRequest', () => {
  it('calls fn_respond_friend_request with the request id and accept flag', async () => {
    mockSupabaseResponse('rpc:fn_respond_friend_request', {
      data: { id: 'req-1', requester_id: 'user-2', addressee_id: 'test-user-id', status: 'accepted', created_at: '2026-08-18T00:00:00Z', responded_at: '2026-08-18T01:00:00Z' },
      error: null,
    });

    const { result } = await renderHook(() => useRespondFriendRequest(), { wrapper: makeWrapper(createTestQueryClient()) });

    await act(async () => {
      await result.current.mutateAsync({ requestId: 'req-1', accept: true });
    });

    const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_respond_friend_request');
    expect(rpcCall?.args[0]).toEqual({ p_request_id: 'req-1', p_accept: true });
  });
});

describe('useRemoveFriend', () => {
  it('calls fn_remove_friend with the friend id', async () => {
    mockSupabaseResponse('rpc:fn_remove_friend', { data: null, error: null });

    const { result } = await renderHook(() => useRemoveFriend(), { wrapper: makeWrapper(createTestQueryClient()) });

    await act(async () => {
      await result.current.mutateAsync('friend-1');
    });

    const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_remove_friend');
    expect(rpcCall?.args[0]).toEqual({ p_friend_id: 'friend-1' });
  });
});

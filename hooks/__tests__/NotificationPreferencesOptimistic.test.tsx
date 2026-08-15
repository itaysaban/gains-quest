import React from 'react';
import { renderHook, act } from '@testing-library/react-native';

jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/lib/testing/renderWithProviders';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { mockSupabaseResponse, resetSupabaseMock, defaultMockSession } from '@/lib/testing/supabaseMockState';
import { useUpdateNotificationPreferences } from '../useNotificationPreferences';
import type { NotificationPreferences } from '@/types/domain';

// Fixes a reported UX bug: toggles in Settings > Notifications visibly lagged behind the tap because
// the query cache only updated after the server round-trip resolved. This mirrors the established
// optimistic-update pattern from hooks/useLoggedSets.ts (onMutate snapshot -> onError rollback ->
// onSettled reconcile).

// useUpdateNotificationPreferences calls useAuth() for the user id, so the wrapper needs the real
// AuthProvider (mocked session underneath), same as renderWithProviders — renderHook has no built-in
// equivalent, so this replicates it directly.
function makeWrapper(queryClient: QueryClient) {
  return function wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

const userId = defaultMockSession.user.id;
const queryKey = ['notification-preferences', userId];

beforeEach(() => {
  resetSupabaseMock();
});

it('updates the cached preferences immediately on mutate, before the server responds', async () => {
  mockSupabaseResponse('notification_preferences', { data: null, error: null });

  const queryClient = createTestQueryClient();
  queryClient.setQueryData<NotificationPreferences>(queryKey, {
    user_id: userId,
    rest_timer_enabled: true,
    routine_reminders_enabled: true,
    streak_warnings_enabled: false,
    quiet_hours_start: null,
    quiet_hours_end: null,
    updated_at: '2026-08-15T00:00:00.000Z',
  } as NotificationPreferences);

  const { result } = await renderHook(() => useUpdateNotificationPreferences(), { wrapper: makeWrapper(queryClient) });
  // Let AuthProvider's mocked getSession() resolve so useAuth() has a user id before mutating.
  await act(async () => {
    await Promise.resolve();
  });

  await act(async () => {
    result.current.mutate({ streak_warnings_enabled: true });
    await Promise.resolve();
  });

  // Assert synchronously, in the same tick as mutate() — onMutate runs before the (mocked, async)
  // network call resolves, so the cache must already reflect the toggle here.
  expect(queryClient.getQueryData<NotificationPreferences>(queryKey)?.streak_warnings_enabled).toBe(true);
});

it('rolls back the optimistic update if the server rejects it', async () => {
  mockSupabaseResponse('notification_preferences', { data: null, error: { message: 'network error' } });

  const queryClient = createTestQueryClient();
  queryClient.setQueryData<NotificationPreferences>(queryKey, {
    user_id: userId,
    rest_timer_enabled: true,
    routine_reminders_enabled: true,
    streak_warnings_enabled: false,
    quiet_hours_start: null,
    quiet_hours_end: null,
    updated_at: '2026-08-15T00:00:00.000Z',
  } as NotificationPreferences);

  const { result } = await renderHook(() => useUpdateNotificationPreferences(), { wrapper: makeWrapper(queryClient) });
  await act(async () => {
    await Promise.resolve();
  });

  await act(async () => {
    try {
      await result.current.mutateAsync({ streak_warnings_enabled: true });
    } catch {
      // expected
    }
  });

  expect(queryClient.getQueryData<NotificationPreferences>(queryKey)?.streak_warnings_enabled).toBe(false);
});

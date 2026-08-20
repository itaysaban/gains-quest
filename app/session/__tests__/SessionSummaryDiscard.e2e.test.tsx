import React from 'react';
import { Alert } from 'react-native';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders, createTestQueryClient } from '@/lib/testing/renderWithProviders';

// A relative path (not the `@/` alias) so Jest's own resolver can find the adjacent lib/__mocks__/
// folder without depending on how babel happens to rewrite alias imports elsewhere — same reasoning
// as ActiveSessionLogging.e2e.test.tsx.
jest.mock('../../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockDismissTo = jest.fn();
const mockRouteParams = {
  sessionId: 'session-1',
  durationSeconds: '1800',
  totalVolume: '4500',
  totalSets: '12',
  pointsEarned: '187',
  prs: '[]',
  newBadges: '[]',
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => ({ dismissTo: mockDismissTo, replace: jest.fn() }),
}));

// Trivial passthroughs for the visual/native pieces this flow doesn't exercise — same pattern as
// ActiveSessionLogging.e2e.test.tsx mocking react-native-reanimated/expo-haptics as no-ops.
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: (props: any) => <View {...props} /> };
});
jest.mock('react-native-confetti-cannon', () => () => null);
jest.mock('react-native-view-shot', () => {
  const { forwardRef } = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: forwardRef((props: any, _ref: any) => <View {...props} />) };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn().mockResolvedValue(false), shareAsync: jest.fn() }));

// SafeAreaProvider renders nothing until it receives a native onLayout event, which never fires in
// the JS test environment — swap it (and SafeAreaView, which Screen.tsx uses) for plain passthrough
// Views so the component tree under test actually renders.
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaProvider: (props: any) => <View {...props} />,
    SafeAreaView: (props: any) => <View {...props} />,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

import { mockSupabaseResponse, resetSupabaseMock, supabaseMockCalls } from '@/lib/testing/supabaseMockState';
import { makeProfile } from '@/lib/testing/fixtures';
import SessionSummary from '../summary';

// Session Summary's Discard button (new this session) wires up fn_delete_completed_session — real,
// points-reversing functionality (PRD §9: "Deleting a session: points are reversed via a negative
// ledger entry; the streak recalculates for affected days") that previously had no UI destination at
// all (Epic 1 Story 1.5 shipped the server side with none). Worth a confirm/cancel test before it's
// ever tapped for real.

function renderSummary() {
  return renderWithProviders(<SessionSummary />);
}

function primeCommonFixtures() {
  mockSupabaseResponse('workout_sessions', {
    data: { id: 'session-1', name: 'Push Day A', started_at: '2026-08-18T10:00:00Z', ended_at: '2026-08-18T10:30:00Z' },
    error: null,
  });
  mockSupabaseResponse('point_ledger', { data: [{ source: 'base', points: 50 }], error: null });
  mockSupabaseResponse('streaks', { data: { current_streak_days: 5 }, error: null });
  mockSupabaseResponse('profiles', { data: makeProfile(), error: null });
}

beforeEach(() => {
  resetSupabaseMock();
  mockDismissTo.mockClear();
  jest.spyOn(Alert, 'alert');
});

afterEach(() => {
  (Alert.alert as jest.Mock).mockRestore();
});

it('pressing Discard shows a confirmation alert before anything happens', async () => {
  primeCommonFixtures();
  await renderSummary();

  fireEvent.press(await screen.findByText('Discard'));

  expect(Alert.alert).toHaveBeenCalledWith(
    'Discard this session?',
    expect.stringContaining('reverses any GainPoints'),
    expect.any(Array),
  );
  expect(supabaseMockCalls.some((c) => c.table === 'rpc:fn_delete_completed_session')).toBe(false);
});

it('confirming calls fn_delete_completed_session with the session id from the route params and navigates home', async () => {
  primeCommonFixtures();
  mockSupabaseResponse('rpc:fn_delete_completed_session', { data: null, error: null });
  const queryClient = createTestQueryClient();
  await renderWithProviders(<SessionSummary />, { queryClient });

  fireEvent.press(await screen.findByText('Discard'));

  const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
  await act(async () => {
    await buttons.find((b: { text: string }) => b.text === 'Discard').onPress();
  });

  const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_delete_completed_session');
  expect(rpcCall?.args[0]).toEqual({ p_session_id: 'session-1' });
  await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)/home'));

  // The mutation's onSuccess invalidates a query, which schedules a background refetch that outlives
  // this test otherwise — unmounting and clearing the client stops it before it can fire mid-render
  // of whichever test runs next and trip an "overlapping act() calls" cross-test failure.
  cleanup();
  queryClient.clear();
});

it('canceling the alert calls neither the delete mutation nor the navigation', async () => {
  primeCommonFixtures();
  await renderSummary();

  fireEvent.press(await screen.findByText('Discard'));

  const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
  const cancelButton = buttons.find((b: { text: string }) => b.text === 'Cancel');
  expect(cancelButton.onPress).toBeUndefined();

  expect(supabaseMockCalls.some((c) => c.table === 'rpc:fn_delete_completed_session')).toBe(false);
  expect(mockDismissTo).not.toHaveBeenCalled();
});

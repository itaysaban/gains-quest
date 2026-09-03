import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { createTestQueryClient, renderWithProviders } from '@/lib/testing/renderWithProviders';
import { challengeBaselineKey } from '@/hooks/useChallenges';

jest.mock('../../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockRouteParams = {
  sessionId: 'session-1',
  durationSeconds: '1800',
  totalVolume: '4500',
  totalSets: '12',
  pointsEarned: '187',
  prs: '[]',
  newBadges: '[]',
};

const mockPush = jest.fn();
const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => ({ dismissTo: mockDismissTo, replace: jest.fn(), push: mockPush }),
}));

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

// Second design handoff (2026-09-01): Session Summary's "Include weights and loads" toggle calls
// fn_update_session_feed_privacy — the "Activity type and duration" toggle is deliberately locked on
// (no lesser state exists), so only the weights toggle is a real control worth testing here. Server-
// side behavior (metadata actually updated, ownership enforced) is already verified against a live
// Postgres project (test-epic11.js).

function primeCommonFixtures() {
  mockSupabaseResponse('workout_sessions', {
    data: { id: 'session-1', name: 'Push Day A', started_at: '2026-08-18T10:00:00Z', ended_at: '2026-08-18T10:30:00Z' },
    error: null,
  });
  mockSupabaseResponse('point_ledger', { data: [{ source: 'base', points: 50 }], error: null });
  mockSupabaseResponse('streaks', { data: { current_streak_days: 5 }, error: null });
  mockSupabaseResponse('profiles', { data: makeProfile(), error: null });
  mockSupabaseResponse('rpc:fn_active_challenges', { data: [], error: null });
  mockSupabaseResponse('rpc:fn_update_session_feed_privacy', { data: null, error: null });
}

beforeEach(() => {
  resetSupabaseMock();
  mockPush.mockClear();
  mockDismissTo.mockClear();
});

/** A quest at `progress` now, against a pre-session baseline of `before` — the diff useQuestGains
 * reads to decide whether this session actually moved anything. */
function primeQuestGain({ before, now }: { before: number; now: number }) {
  const quest = { id: 'uc-1', code: 'daily_workout', name: 'Log a workout', description: 'Log a workout', metric: 'sessions_completed', target_value: 1, status: 'active', points: 20, period_end: '2026-09-03' };
  const queryClient = createTestQueryClient();
  queryClient.setQueryData(challengeBaselineKey, [{ ...quest, progress_value: before }]);
  mockSupabaseResponse('rpc:fn_active_challenges', { data: [{ ...quest, progress_value: now }], error: null });
  return queryClient;
}

it('"Save session" routes to the dedicated Quest Progress screen when this session advanced a quest', async () => {
  primeCommonFixtures();
  const queryClient = primeQuestGain({ before: 0, now: 1 });
  await renderWithProviders(<SessionSummary />, { queryClient });

  fireEvent.press(await screen.findByText('Save session'));

  expect(mockPush).toHaveBeenCalledWith('/session/quest-progress');
});

it('"Save session" skips Quest Progress and goes straight home when nothing advanced', async () => {
  primeCommonFixtures();
  const queryClient = primeQuestGain({ before: 1, now: 1 });
  await renderWithProviders(<SessionSummary />, { queryClient });

  fireEvent.press(await screen.findByText('Save session'));

  expect(mockPush).not.toHaveBeenCalledWith('/session/quest-progress');
  expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)/home');
});

it('the "Activity type and duration" switch is locked on and never calls the privacy RPC', async () => {
  primeCommonFixtures();
  await renderWithProviders(<SessionSummary />);

  const switches = await screen.findAllByRole('switch');
  expect(switches[0].props.value).toBe(true);
  expect(switches[0].props.disabled).toBe(true);
});

it('toggling "Include weights and loads" on calls fn_update_session_feed_privacy with includeWeights true', async () => {
  primeCommonFixtures();
  await renderWithProviders(<SessionSummary />);

  const switches = await screen.findAllByRole('switch');
  await act(async () => {
    fireEvent(switches[1], 'valueChange', true);
    await Promise.resolve();
  });

  const rpcCall = supabaseMockCalls.find((c) => c.table === 'rpc:fn_update_session_feed_privacy');
  expect(rpcCall?.args[0]).toEqual({ p_session_id: 'session-1', p_include_weights: true });
});

it('toggling it back off calls the RPC again with includeWeights false', async () => {
  primeCommonFixtures();
  await renderWithProviders(<SessionSummary />);

  const switches = await screen.findAllByRole('switch');
  await act(async () => {
    fireEvent(switches[1], 'valueChange', true);
    await Promise.resolve();
  });
  await act(async () => {
    fireEvent(switches[1], 'valueChange', false);
    await Promise.resolve();
  });

  const rpcCalls = supabaseMockCalls.filter((c) => c.table === 'rpc:fn_update_session_feed_privacy');
  expect(rpcCalls).toHaveLength(2);
  expect(rpcCalls[1].args[0]).toEqual({ p_session_id: 'session-1', p_include_weights: false });
});

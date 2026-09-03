import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '@/lib/testing/renderWithProviders';

jest.mock('../../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockDismissTo = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mockDismissTo }),
}));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: (props: any) => <View {...props} /> };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaProvider: (props: any) => <View {...props} />,
    SafeAreaView: (props: any) => <View {...props} />,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});

import { mockSupabaseResponse, resetSupabaseMock } from '@/lib/testing/supabaseMockState';
import QuestProgress from '../quest-progress';

// A dedicated post-workout screen, split out of Session Summary per explicit request rather than
// living as a section inside it.

beforeEach(() => {
  resetSupabaseMock();
  mockDismissTo.mockClear();
  mockSupabaseResponse('rpc:fn_active_challenges', {
    data: [
      {
        id: 'uc-1',
        code: 'daily_workout',
        name: 'Log a workout',
        description: 'Log a workout',
        metric: 'sessions_completed',
        target_value: 1,
        progress_value: 1,
        status: 'ready_to_claim',
        points: 20,
        period_end: '2026-09-01',
      },
    ],
    error: null,
  });
});

it('renders the day\'s quests', async () => {
  await renderWithProviders(<QuestProgress />);

  expect(await screen.findByText('Log a workout')).toBeTruthy();
});

it('Continue navigates back to Home', async () => {
  await renderWithProviders(<QuestProgress />);
  await screen.findByText('Log a workout');

  fireEvent.press(screen.getByText('Continue'));

  expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)/home');
});

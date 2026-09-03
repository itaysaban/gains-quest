import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithProviders } from '@/lib/testing/renderWithProviders';

jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

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
import Onboarding from '../onboarding';

// M5 (Polish), Story 1: onboarding must never be a dead end (PRD §10 exit criterion). Every branch
// (Skip on step 2, all three actions on step 3) has to both mark onboarding_completed_at and
// navigate somewhere real — this is exactly the kind of "forgot to wire one path" bug that's easy to
// introduce silently in a multi-step screen like this.

beforeEach(() => {
  resetSupabaseMock();
  mockReplace.mockClear();
  mockSupabaseResponse('profiles', { data: makeProfile({ onboarding_completed_at: null }), error: null });
});

it('walks from welcome through preferences to the final step', async () => {
  await renderWithProviders(<Onboarding />);

  expect(screen.getByText('Welcome to GainQuest')).toBeTruthy();
  fireEvent.press(screen.getByText('Get started'));

  expect(await screen.findByText('Quick setup')).toBeTruthy();
  fireEvent.press(screen.getByText('Continue'));

  expect(await screen.findByText("Let's get moving")).toBeTruthy();
});

it('selecting a unit or a training-day count updates the profile', async () => {
  mockSupabaseResponse('profiles', { data: makeProfile({ onboarding_completed_at: null, unit_preference: 'kg' }), error: null });
  await renderWithProviders(<Onboarding />);
  fireEvent.press(screen.getByText('Get started'));
  await screen.findByText('Quick setup');

  await act(async () => {
    fireEvent.press(screen.getByText('Pounds (lb)'));
  });
  let updateCall = supabaseMockCalls.find((c) => c.table === 'profiles' && c.method === 'update' && (c.args[0] as { unit_preference?: string })?.unit_preference);
  expect(updateCall?.args[0]).toEqual({ unit_preference: 'lb' });

  await act(async () => {
    fireEvent.press(screen.getByText('5'));
  });
  updateCall = supabaseMockCalls.find((c) => c.table === 'profiles' && c.method === 'update' && (c.args[0] as { weekly_goal_days?: number })?.weekly_goal_days);
  expect(updateCall?.args[0]).toEqual({ weekly_goal_days: 5 });
});

it('Skip on the preferences step marks onboarding complete and goes straight home', async () => {
  await renderWithProviders(<Onboarding />);
  fireEvent.press(screen.getByText('Get started'));
  await screen.findByText('Quick setup');

  await act(async () => {
    fireEvent.press(screen.getByText('Skip for now'));
  });

  const updateCall = supabaseMockCalls.find((c) => c.table === 'profiles' && c.method === 'update' && (c.args[0] as { onboarding_completed_at?: string })?.onboarding_completed_at);
  expect(updateCall).toBeTruthy();
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
});

it('"Build a routine" marks onboarding complete and routes straight to the routine builder', async () => {
  await renderWithProviders(<Onboarding />);
  fireEvent.press(screen.getByText('Get started'));
  await screen.findByText('Quick setup');
  fireEvent.press(screen.getByText('Continue'));
  await screen.findByText("Let's get moving");

  await act(async () => {
    fireEvent.press(screen.getByText('Build a routine'));
  });

  expect(supabaseMockCalls.some((c) => c.table === 'profiles' && c.method === 'update' && (c.args[0] as { onboarding_completed_at?: string })?.onboarding_completed_at)).toBe(true);
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/add-workout/routines/new');
});

it('"Quick start a workout" marks onboarding complete and routes to Add Workout', async () => {
  await renderWithProviders(<Onboarding />);
  fireEvent.press(screen.getByText('Get started'));
  await screen.findByText('Quick setup');
  fireEvent.press(screen.getByText('Continue'));
  await screen.findByText("Let's get moving");

  await act(async () => {
    fireEvent.press(screen.getByText('Quick start a workout'));
  });

  expect(supabaseMockCalls.some((c) => c.table === 'profiles' && c.method === 'update' && (c.args[0] as { onboarding_completed_at?: string })?.onboarding_completed_at)).toBe(true);
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/add-workout');
});

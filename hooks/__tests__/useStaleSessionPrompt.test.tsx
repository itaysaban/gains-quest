import { Alert } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/lib/testing/renderWithProviders';

jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

import { resetSupabaseMock } from '@/lib/testing/supabaseMockState';
import { useSessionStore } from '@/store/sessionStore';
import { useStaleSessionPrompt } from '../useStaleSessionPrompt';

// PRD 6.1.3: "an unfinished session older than 12 hours prompts 'Finish or discard?' on next open."

const STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000;

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  resetSupabaseMock();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  useSessionStore.getState().endSession();
});

afterEach(() => {
  jest.restoreAllMocks();
  useSessionStore.getState().endSession();
});

it('prompts "Unfinished workout" when the active session has been running for 12+ hours', async () => {
  useSessionStore.setState({ sessionId: 'session-1', startedAtMs: Date.now() - STALE_THRESHOLD_MS - 60_000 });

  await renderHook(() => useStaleSessionPrompt(), { wrapper });

  expect(Alert.alert).toHaveBeenCalledWith(
    'Unfinished workout',
    expect.stringContaining('12 hours'),
    expect.any(Array),
    expect.objectContaining({ cancelable: false }),
  );
});

it('does not prompt for a session well under the 12-hour threshold', async () => {
  useSessionStore.setState({ sessionId: 'session-1', startedAtMs: Date.now() - 30 * 60 * 1000 });

  await renderHook(() => useStaleSessionPrompt(), { wrapper });

  expect(Alert.alert).not.toHaveBeenCalled();
});

it('does not prompt when there is no active session at all', async () => {
  useSessionStore.setState({ sessionId: null, startedAtMs: null });

  await renderHook(() => useStaleSessionPrompt(), { wrapper });

  expect(Alert.alert).not.toHaveBeenCalled();
});

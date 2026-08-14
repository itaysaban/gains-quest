import { renderHook } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/lib/testing/renderWithProviders';
import { AuthProvider } from '@/lib/auth/AuthProvider';

jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { mockSupabaseResponse, resetSupabaseMock } from '@/lib/testing/supabaseMockState';
import { useLastSessionSets } from '../useLastSessionSets';

// Regression test for the "input flashes while typing" bug: when there's no prior session, this
// hook used to return a brand-new `{ sessionDate: null, sets: [] }` object literal on every render.
// DraftSetRow's pre-fill effect depends on this value, so a fresh reference on every keystroke's
// re-render reset the draft right after the user typed into it. It must now be referentially stable.

beforeEach(() => {
  resetSupabaseMock();
});

it('returns the exact same "no last session" object reference across re-renders', async () => {
  mockSupabaseResponse('exercise_current_best', { data: null, error: null });
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );

  const { result, rerender } = await renderHook(() => useLastSessionSets('exercise-1'), { wrapper });
  const first = result.current.data;

  await rerender(undefined);
  const second = result.current.data;

  expect(second).toBe(first); // same reference, not just equal content
  expect(second).toEqual({ sessionDate: null, sets: [] });
});

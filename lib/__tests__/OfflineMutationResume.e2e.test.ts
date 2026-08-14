import { onlineManager, MutationObserver } from '@tanstack/react-query';
import { waitFor } from '@testing-library/react-native';

// M1 resilience (README §5 "Local-first / offline resilience"): a set logged with no signal must
// queue instead of failing, survive an app kill, and resolve exactly once — never duplicated — once
// resumed after reconnecting. This is the exact mechanism registerMutationDefaults()/
// resumePausedMutations() exist for, so it's exercised end-to-end against the real singleton
// queryClient rather than a throwaway test client.

// Not the shipped netinfo-mock: it fires its own connectivity event asynchronously, which races with
// (and can silently overwrite) this test's manual onlineManager.setOnline() calls below. A no-op stub
// means online/offline state here is driven exclusively by the test, deterministically.
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => () => {}),
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../supabase');

import { queryClient } from '@/lib/queryClient';
import { registerMutationDefaults } from '@/lib/registerMutationDefaults';
import { mutationKeys } from '@/lib/mutationKeys';
import { mockSupabaseResponse, mockSupabaseResponseOnce, resetSupabaseMock, supabaseMockCalls } from '@/lib/testing/supabaseMockState';
import { makeLoggedSet } from '@/lib/testing/fixtures';
import type { LogSetInput } from '@/hooks/useLoggedSets';
import type { LoggedSet } from '@/types/domain';

beforeEach(() => {
  resetSupabaseMock();
  queryClient.clear();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

it('registers a resumable default mutationFn for every mutation the README calls out as app-kill-safe', () => {
  registerMutationDefaults();
  expect(queryClient.getMutationDefaults(mutationKeys.logSet).mutationFn).toBeInstanceOf(Function);
  expect(queryClient.getMutationDefaults(mutationKeys.updateLoggedSet).mutationFn).toBeInstanceOf(Function);
  expect(queryClient.getMutationDefaults(mutationKeys.deleteLoggedSet).mutationFn).toBeInstanceOf(Function);
  expect(queryClient.getMutationDefaults(mutationKeys.addExerciseToSession).mutationFn).toBeInstanceOf(Function);
});

it('queues a set logged while offline, then resolves it — idempotently, by reusing the same client-generated id — once reconnected and resumed', async () => {
  registerMutationDefaults();

  const clientId = 'fixed-client-id-123';
  const input: LogSetInput & { clientId: string } = {
    sessionExerciseId: 'se-1',
    sessionId: 'session-1',
    exerciseId: 'exercise-1',
    setIndex: 0,
    setType: 'working',
    weight: 100,
    reps: 5,
    clientId,
  };

  // React Query's networkMode: 'offlineFirst' (this app's config, lib/queryClient.ts) always makes one
  // attempt regardless of connectivity — pausing only kicks in on the retry that follows a failure while
  // offline. So the realistic "gym wifi died mid-set" sequence is: attempt 1 fails, then it pauses.
  mockSupabaseResponseOnce('logged_sets', { data: null, error: { message: 'Network request failed' } });
  onlineManager.setOnline(false);

  // No mutationFn passed — this only works because registerMutationDefaults() already registered one
  // for this key, the exact mechanism resumePausedMutations() depends on after a real app restart.
  const observer = new MutationObserver<LoggedSet, Error, LogSetInput & { clientId: string }>(queryClient, {
    mutationKey: mutationKeys.logSet,
  });
  const settled = observer.mutate(input).catch(() => {});

  await waitFor(
    () => {
      const state = queryClient.getMutationCache().find({ mutationKey: mutationKeys.logSet })?.state;
      if (!state?.isPaused) throw new Error('not paused yet');
    },
    { timeout: 5000 },
  );

  // Exactly the one (failed) attempt reached the network before pausing to wait for reconnection.
  expect(supabaseMockCalls.filter((c) => c.table === 'logged_sets' && c.method === 'upsert')).toHaveLength(1);

  // Flipping onlineManager back on can itself let the still-alive paused mutation continue (it's the
  // same process, same in-memory observer — unlike a real app-kill), and resumePausedMutations() may
  // independently retry it too. The system's actual guarantee isn't "exactly one retry attempt" — it's
  // that every attempt is safe to make, because every attempt reuses the same client-generated id.
  // Every subsequent attempt gets the same success response so whichever path(s) fire all succeed.
  mockSupabaseResponse('logged_sets', {
    data: makeLoggedSet({ id: clientId, session_exercise_id: 'se-1', weight: 100, reps: 5 }),
    error: null,
  });
  onlineManager.setOnline(true);
  await queryClient.resumePausedMutations();
  await settled;

  const upsertCalls = supabaseMockCalls.filter((c) => c.table === 'logged_sets' && c.method === 'upsert');
  expect(upsertCalls.length).toBeGreaterThanOrEqual(2); // the original failed attempt + at least one retry
  const idsUsed = new Set(upsertCalls.map((c) => (c.args[0] as { id: string }).id));
  expect(idsUsed).toEqual(new Set([clientId])); // every attempt reused the same id — safe to upsert, never a duplicate row
}, 10000);

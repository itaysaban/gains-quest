import { queryClient } from './queryClient';
import { mutationKeys } from './mutationKeys';
import { logSetMutationFn, updateLoggedSetMutationFn, deleteLoggedSetMutationFn } from '@/hooks/useLoggedSets';
import { addExerciseToSessionMutationFn } from '@/hooks/useWorkoutSession';

/**
 * Registers a mutationFn for every mutationKey a killed-and-relaunched app needs to resume. Must run
 * once at startup, before the persisted cache is restored — resumePausedMutations() (called in
 * app/_layout.tsx once restoration completes) can only resume a mutation whose key resolves to a
 * registered default, since the original inline mutationFn closure can't survive serialization.
 * Scoped deliberately to the active-session write path (logging/editing/deleting a set, adding an
 * exercise mid-session) — the scenario this exists for is "gym, no signal, app got killed," not every
 * mutation in the app.
 */
export function registerMutationDefaults() {
  queryClient.setMutationDefaults(mutationKeys.logSet, { mutationFn: logSetMutationFn });
  queryClient.setMutationDefaults(mutationKeys.updateLoggedSet, {
    mutationFn: async (input: Parameters<typeof updateLoggedSetMutationFn>[0]) => {
      await updateLoggedSetMutationFn(input);
      return input.sessionId;
    },
  });
  queryClient.setMutationDefaults(mutationKeys.deleteLoggedSet, {
    mutationFn: async (input: Parameters<typeof deleteLoggedSetMutationFn>[0]) => {
      await deleteLoggedSetMutationFn(input);
      return input.sessionId;
    },
  });
  queryClient.setMutationDefaults(mutationKeys.addExerciseToSession, { mutationFn: addExerciseToSessionMutationFn });
}

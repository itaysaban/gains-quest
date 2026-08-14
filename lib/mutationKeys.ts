/**
 * Stable keys for mutations that must survive an app kill and resume automatically once the persisted
 * query cache restores (see app/_layout.tsx's PersistQueryClientProvider onSuccess + resumePausedMutations,
 * and lib/registerMutationDefaults.ts). React Query can't serialize a mutationFn closure across a restart —
 * only a registered default keyed by mutationKey survives, so every mutation here needs both a matching
 * `mutationKey` on its useMutation call AND a registered default with the same key.
 */
export const mutationKeys = {
  logSet: ['mutation', 'log-set'] as const,
  updateLoggedSet: ['mutation', 'update-logged-set'] as const,
  deleteLoggedSet: ['mutation', 'delete-logged-set'] as const,
  addExerciseToSession: ['mutation', 'add-exercise-to-session'] as const,
};

import type { RoutineExerciseWithDetails } from '@/types/domain';

const SUPERSET_LETTERS = 'ABCDEFGHIJ';

/** True when items[idx] is linked into the same superset group as items[idx - 1]. */
export function isSupersetLinkedToPrevious(items: RoutineExerciseWithDetails[], idx: number): boolean {
  if (idx === 0) return false;
  const prev = items[idx - 1];
  const cur = items[idx];
  return !!cur.superset_group_id && cur.superset_group_id === prev.superset_group_id;
}

/** "SUPERSET A/B/…" label shown only on the first item of each group — one letter per distinct
 * superset_group_id encountered so far, in list order. Routine Builder — design handoff §5. */
export function supersetLabel(items: RoutineExerciseWithDetails[], idx: number): string | undefined {
  const cur = items[idx];
  if (!cur.superset_group_id || isSupersetLinkedToPrevious(items, idx)) return undefined;
  const seenGroupIds = new Set<string>();
  for (let i = 0; i < idx; i++) {
    if (items[i].superset_group_id) seenGroupIds.add(items[i].superset_group_id!);
  }
  return `SUPERSET ${SUPERSET_LETTERS[seenGroupIds.size] ?? seenGroupIds.size + 1}`;
}

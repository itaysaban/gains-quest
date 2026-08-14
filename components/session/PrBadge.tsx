import { useEffect, useRef, useState } from 'react';
import { Toast } from '@/components/ui/Toast';
import type { LoggedSet } from '@/types/domain';

/**
 * Watches an exercise card's set list and fires a toast the moment the most-recently-logged set carries
 * is_pr — which happens instantly for the optimistic row (see hooks/useLoggedSets.ts's onMutate) and is
 * only ever reconciled quietly afterward, never re-toasted or retracted (see that file's header comment
 * on the client/server disagreement handling). Dedup is keyed by the set's id (client-generated, so
 * stable across the optimistic->server-confirmed transition) via a ref, not state, so it survives
 * re-renders without re-triggering.
 */
export function PrBadge({ sets, exerciseName }: { sets: LoggedSet[]; exerciseName: string }) {
  const celebratedIds = useRef<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const latestPr = [...sets].reverse().find((s) => s.is_pr && !celebratedIds.current.has(s.id));
    if (!latestPr) return;

    celebratedIds.current.add(latestPr.id);
    setToastMessage(`New PR — ${exerciseName}! 🏆`);
  }, [sets, exerciseName]);

  return <Toast visible={!!toastMessage} message={toastMessage ?? ''} onHide={() => setToastMessage(null)} />;
}

import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/sessionStore';
import { formatDuration } from '@/lib/utils/date';
import { Text } from '@/components/ui/Text';

export function SessionTimer() {
  const elapsedSeconds = useSessionStore((s) => s.elapsedSeconds);
  const isPaused = useSessionStore((s) => s.isPaused);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Text weight="700" variant="subtitle" color={isPaused ? 'muted' : 'default'}>
      {formatDuration(elapsedSeconds())} {isPaused ? '(paused)' : ''}
    </Text>
  );
}

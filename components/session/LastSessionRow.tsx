import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useLastSessionSets } from '@/hooks/useLastSessionSets';
import { formatShortDate } from '@/lib/utils/date';
import { spacing } from '@/lib/theme';
import type { TrackingType } from '@/types/database.types';
import type { LoggedSet } from '@/types/domain';

export function formatSetCompact(set: LoggedSet, trackingType: TrackingType): string {
  switch (trackingType) {
    case 'bodyweight_reps':
      return `${set.reps ?? 0} reps`;
    case 'time':
      return `${set.time_seconds ?? 0}s`;
    case 'distance':
      return `${set.distance_meters ?? 0}m`;
    case 'distance_duration':
      return `${set.distance_meters ?? 0}m/${set.time_seconds ?? 0}s`;
    case 'weight_reps':
    default:
      return `${set.weight ?? 0}kg×${set.reps ?? 0}`;
  }
}

/** Always-visible last-time row (PRD 6.1.3) — never behind a tap. Reads the fast exercise_current_best
 * pointer via useLastSessionSets rather than scanning history. */
export function LastSessionRow({ exerciseId, trackingType }: { exerciseId: string; trackingType: TrackingType }) {
  const { data, isLoading } = useLastSessionSets(exerciseId);

  if (isLoading) return null;

  const workingSets = (data?.sets ?? []).filter((s) => s.set_type !== 'warmup');

  if (!data?.sessionDate || workingSets.length === 0) {
    return (
      <View style={{ paddingVertical: spacing.xs }}>
        <Text variant="caption" color="muted">
          First time — set your baseline.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ paddingVertical: spacing.xs }}>
      <Text variant="caption" color="muted">
        {formatShortDate(data.sessionDate)} · {workingSets.map((s) => formatSetCompact(s, trackingType)).join(' · ')}
      </Text>
    </View>
  );
}

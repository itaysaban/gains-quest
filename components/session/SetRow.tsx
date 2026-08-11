import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import type { LoggedSet } from '@/types/domain';
import type { TrackingType } from '@/types/database.types';

const SET_TYPE_LABEL: Record<LoggedSet['set_type'], string> = {
  warmup: 'W',
  working: '',
  drop: 'D',
  failure: 'F',
};

export function SetRow({
  set,
  index,
  trackingType,
  onEdit,
  onDelete,
}: {
  set: LoggedSet;
  index: number;
  trackingType: TrackingType;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();

  const valueLabel =
    trackingType === 'time'
      ? `${set.time_seconds ?? 0}s`
      : trackingType === 'distance'
        ? `${set.distance_meters ?? 0}m`
        : trackingType === 'bodyweight_reps'
          ? `${set.reps ?? 0} reps`
          : `${set.weight ?? 0} × ${set.reps ?? 0}`;

  return (
    <Pressable
      onPress={onEdit}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.sm,
        gap: spacing.sm,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: radius.sm,
          backgroundColor: set.set_type === 'warmup' ? theme.surfaceAlt : theme.primaryMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="label" weight="700" color={set.set_type === 'warmup' ? 'muted' : 'primary'}>
          {SET_TYPE_LABEL[set.set_type] || index + 1}
        </Text>
      </View>
      <Text style={{ flex: 1 }} weight="600">
        {valueLabel}
      </Text>
      {set.rpe != null ? (
        <Text variant="caption" color="muted">
          RPE {set.rpe}
        </Text>
      ) : null}
      {set.is_pr ? <Ionicons name="trophy" size={16} color={theme.warning} /> : null}
      {set.set_type === 'failure' ? <Ionicons name="flash" size={16} color={theme.danger} /> : null}
      <Pressable onPress={onDelete} hitSlop={8}>
        <Ionicons name="trash-outline" size={18} color={theme.textMuted} />
      </Pressable>
    </Pressable>
  );
}

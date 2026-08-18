import { View, Pressable } from 'react-native';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { formatSetCompact } from './LastSessionRow';
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

  const valueLabel = formatSetCompact(set, trackingType);

  return (
    <Pressable
      onPress={onEdit}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 9,
        gap: spacing.sm,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: radius.sm,
          backgroundColor: set.set_type === 'warmup' ? theme.cardInset : theme.success,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text font="body" weight="700" size={12} style={{ color: set.set_type === 'warmup' ? theme.textMuted : '#0D2A1A' }}>
          {SET_TYPE_LABEL[set.set_type] || index + 1}
        </Text>
      </View>
      <Text font="mono" weight="600" size={14} style={{ flex: 1, color: set.set_type === 'warmup' ? theme.textMuted : theme.success }}>
        {valueLabel}
      </Text>
      {set.rpe != null ? (
        <Text font="body" size={12} color="muted">
          RPE {set.rpe}
        </Text>
      ) : null}
      {set.is_pr ? <Text style={{ fontSize: 15 }}>🏆</Text> : null}
      {set.set_type === 'failure' ? <Text style={{ fontSize: 14 }}>⚡</Text> : null}
      <Pressable onPress={onDelete} hitSlop={8}>
        <Text style={{ fontSize: 15, color: theme.textMuted }}>🗑</Text>
      </Pressable>
    </Pressable>
  );
}

import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import type { RoutineExerciseWithDetails } from '@/types/domain';

interface Props {
  item: RoutineExerciseWithDetails;
  isSupersetLinked: boolean;
  onDrag: () => void;
  onRemove: () => void;
  onToggleSuperset: () => void;
  onPatch: (patch: Partial<{ target_sets: number | null; target_reps_min: number | null; target_reps_max: number | null; rest_seconds: number | null }>) => void;
}

export function RoutineExerciseRow({ item, isSupersetLinked, onDrag, onRemove, onToggleSuperset, onPatch }: Props) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.surface,
        borderRadius: radius.md,
        marginBottom: spacing.sm,
        borderLeftWidth: isSupersetLinked ? 4 : 0,
        borderLeftColor: theme.primary,
        borderWidth: 1,
        borderColor: theme.border,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <Pressable onPressIn={onDrag} hitSlop={8}>
        <Ionicons name="reorder-three" size={22} color={theme.textMuted} />
      </Pressable>

      <View style={{ flex: 1, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text weight="600">{item.exercise.name}</Text>
          <Pressable onPress={onRemove} hitSlop={8}>
            <Ionicons name="close-circle-outline" size={20} color={theme.textMuted} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Sets"
              keyboardType="number-pad"
              value={item.target_sets != null ? String(item.target_sets) : ''}
              onChangeText={(t) => onPatch({ target_sets: t ? Number(t) : null })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Reps"
              keyboardType="number-pad"
              placeholder="e.g. 8"
              value={item.target_reps_max != null ? String(item.target_reps_max) : ''}
              onChangeText={(t) => onPatch({ target_reps_min: t ? Number(t) : null, target_reps_max: t ? Number(t) : null })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Rest (s)"
              keyboardType="number-pad"
              value={item.rest_seconds != null ? String(item.rest_seconds) : ''}
              onChangeText={(t) => onPatch({ rest_seconds: t ? Number(t) : null })}
            />
          </View>
        </View>

        <Pressable onPress={onToggleSuperset} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name={isSupersetLinked ? 'link' : 'link-outline'} size={16} color={theme.primary} />
          <Text variant="caption" color="primary" weight="600">
            {isSupersetLinked ? 'Linked as superset with previous' : 'Link as superset with previous'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

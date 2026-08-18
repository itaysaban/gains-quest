import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, spacing } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import type { Exercise } from '@/types/domain';

export function ExerciseCardHeader({
  exercise,
  onRemove,
  onSwap,
  removeDisabled,
}: {
  exercise: Exercise;
  onRemove: () => void;
  onSwap: () => void;
  removeDisabled?: boolean;
}) {
  const router = useRouter();
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable
        onPress={() => router.push(`/(tabs)/progress/${exercise.id}/chart`)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}
      >
        <Text font="body" weight="700" size={18} style={{ lineHeight: 19 }}>
          {exercise.name}
        </Text>
        <Text style={{ fontSize: 15, color: theme.textMuted }}>›</Text>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {!removeDisabled ? (
          <Pressable onPress={onSwap} hitSlop={8}>
            <Text style={{ fontSize: 16, color: theme.textMuted }}>⇄</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={{ fontSize: 16, color: theme.textMuted }}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

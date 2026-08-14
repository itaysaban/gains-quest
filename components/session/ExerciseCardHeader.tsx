import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}
      >
        <Text weight="700" variant="subtitle">
          {exercise.name}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
      </Pressable>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {!removeDisabled ? (
          <Pressable onPress={onSwap} hitSlop={8}>
            <Ionicons name="swap-horizontal" size={20} color={theme.textMuted} />
          </Pressable>
        ) : null}
        <Pressable onPress={onRemove} hitSlop={8}>
          <Ionicons name="close-circle-outline" size={20} color={theme.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

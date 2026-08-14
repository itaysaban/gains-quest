import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { useProgressionSuggestion } from '@/hooks/useProgressionSuggestion';
import type { Exercise, SessionExercise } from '@/types/domain';

/** Advisory double-progression chip (PRD 6.1.4). Tapping only pre-fills the draft weight — never
 * auto-logs a set. */
export function ProgressionChip({
  exercise,
  sessionExercise,
  onAccept,
}: {
  exercise: Exercise;
  sessionExercise: Pick<SessionExercise, 'target_reps_min' | 'target_reps_max'>;
  onAccept: (deltaKg: number) => void;
}) {
  const theme = useTheme();
  const suggestion = useProgressionSuggestion(exercise, sessionExercise);

  if (!suggestion) return null;

  const isIncrease = suggestion.type === 'increase';
  const label = isIncrease ? `Try +${suggestion.deltaKg}kg today` : `Consider ${suggestion.deltaKg}kg (deload)`;

  return (
    <Pressable
      onPress={() => onAccept(suggestion.deltaKg)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        alignSelf: 'flex-start',
        backgroundColor: isIncrease ? theme.primaryMuted : theme.surfaceAlt,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
        borderRadius: radius.full,
      }}
    >
      <Ionicons name={isIncrease ? 'trending-up' : 'trending-down'} size={14} color={isIncrease ? theme.primary : theme.textMuted} />
      <Text variant="label" weight="600" color={isIncrease ? 'primary' : 'muted'}>
        {label}
      </Text>
    </Pressable>
  );
}

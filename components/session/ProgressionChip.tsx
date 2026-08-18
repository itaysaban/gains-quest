import { Pressable, View } from 'react-native';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { useProgressionSuggestion } from '@/hooks/useProgressionSuggestion';
import type { Exercise, SessionExercise } from '@/types/domain';

/** Advisory double-progression chip (design handoff §3, PRD §6.1.4). Tapping only pre-fills the
 * draft weight — never auto-logs a set. */
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
  const label = isIncrease ? `Hit top of range last time — try +${suggestion.deltaKg}kg` : `Consider ${suggestion.deltaKg}kg (deload)`;

  return (
    <Pressable
      onPress={() => onAccept(suggestion.deltaKg)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        backgroundColor: isIncrease ? '#2A1F0D' : theme.cardInset,
        borderWidth: 1,
        borderColor: isIncrease ? '#5C4416' : theme.borderSubtle,
        paddingHorizontal: spacing.sm,
        paddingVertical: 9,
        borderRadius: radius.md,
      }}
    >
      <Text style={{ fontSize: 13 }}>{isIncrease ? '↗' : '↘'}</Text>
      <Text font="body" weight="600" size={12} style={{ flex: 1, color: isIncrease ? theme.warning : theme.textSecondary }}>
        {label}
      </Text>
      <View>
        <Text font="body" weight="700" size={12} style={{ color: isIncrease ? theme.warning : theme.textSecondary }}>
          Apply
        </Text>
      </View>
    </Pressable>
  );
}

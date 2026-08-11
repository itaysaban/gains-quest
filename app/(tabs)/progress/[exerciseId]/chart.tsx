import { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { StrengthLineChart } from '@/components/charts/StrengthLineChart';
import { useExercise } from '@/hooks/useExercises';
import { usePersonalRecords } from '@/hooks/useGamification';
import { useExerciseHistory, aggregateHistoryByDay, type ChartMetric } from '@/hooks/useProgress';
import { useTheme, spacing, radius } from '@/lib/theme';
import { formatShortDate } from '@/lib/utils/date';

const METRICS: { value: ChartMetric; label: string; unit: string }[] = [
  { value: 'max_weight', label: 'Max Weight', unit: 'kg' },
  { value: 'est_1rm', label: 'Est. 1RM', unit: 'kg' },
  { value: 'volume', label: 'Volume', unit: 'kg' },
];

const RECORD_TYPE_LABEL: Record<string, string> = {
  max_weight: 'Max Weight',
  max_reps_at_weight: 'Best Reps',
  est_1rm: 'Est. 1RM',
  session_volume: 'Session Volume',
};

export default function ExerciseChart() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const theme = useTheme();
  const [metric, setMetric] = useState<ChartMetric>('max_weight');

  const { data: exercise } = useExercise(exerciseId);
  const { data: history, isLoading } = useExerciseHistory(exerciseId);
  const { data: records } = usePersonalRecords(exerciseId);

  const points = useMemo(() => aggregateHistoryByDay(history ?? [], metric), [history, metric]);
  const activeMetric = METRICS.find((m) => m.value === metric)!;

  if (isLoading) return <LoadingState />;

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <Text variant="title">{exercise?.name}</Text>

        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          {METRICS.map((m) => {
            const active = m.value === metric;
            return (
              <Pressable
                key={m.value}
                onPress={() => setMetric(m.value)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.full,
                  backgroundColor: active ? theme.primary : theme.surfaceAlt,
                }}
              >
                <Text variant="caption" weight="600" style={{ color: active ? '#FFF' : theme.text }}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Card>
          <StrengthLineChart points={points} unit={activeMetric.unit} />
        </Card>

        <View style={{ gap: spacing.sm }}>
          <Text variant="subtitle">Personal Records</Text>
          {records && records.length > 0 ? (
            records.map((pr) => (
              <Card key={pr.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="trophy" size={20} color={theme.warning} />
                <View>
                  <Text weight="600">
                    {RECORD_TYPE_LABEL[pr.record_type] ?? pr.record_type}: {Math.round(pr.value * 10) / 10}
                  </Text>
                  <Text variant="caption" color="muted">
                    {formatShortDate(pr.achieved_at)}
                  </Text>
                </View>
              </Card>
            ))
          ) : (
            <EmptyState icon="trophy-outline" title="No PRs yet" message="Keep logging to set your first record." />
          )}
        </View>
      </View>
    </Screen>
  );
}

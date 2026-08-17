import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { useWorkoutSession, useSessionExercises } from '@/hooks/useWorkoutSession';
import { useSessionPoints } from '@/hooks/useGamification';
import { formatShortDate } from '@/lib/utils/date';
import { spacing } from '@/lib/theme';

export default function SessionDetail() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { data: workoutSession, isLoading: loadingSession } = useWorkoutSession(sessionId);
  const { data: exercises, isLoading: loadingExercises } = useSessionExercises(sessionId);
  const { data: points } = useSessionPoints(sessionId);

  if (loadingSession || loadingExercises || !workoutSession) return <LoadingState />;

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <View>
          <Text variant="title">{workoutSession.name ?? 'Workout'}</Text>
          <Text color="muted">{formatShortDate(workoutSession.started_at)}</Text>
        </View>

        <Card style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          <Stat label="Volume" value={`${Math.round(workoutSession.total_volume)}kg`} />
          <Stat label="Sets" value={String(workoutSession.total_sets)} />
          <Stat label="GP" value={`+${points ?? 0}`} />
        </Card>

        {workoutSession.notes ? (
          <Card>
            <Text variant="label" color="muted" weight="600">
              NOTES
            </Text>
            <Text>{workoutSession.notes}</Text>
          </Card>
        ) : null}

        {(exercises ?? []).map((se) => (
          <Card key={se.id} style={{ gap: spacing.xs }}>
            <Text weight="600">{se.exercise.name}</Text>
            {se.sets.map((set, idx) => (
              <Text key={set.id} variant="caption" color="muted">
                Set {idx + 1} ({set.set_type}): {set.weight ?? 0}kg × {set.reps ?? 0}
                {set.rpe != null ? ` · RPE ${set.rpe}` : ''}
                {set.is_pr ? ' · 🏆 PR' : ''}
              </Text>
            ))}
          </Card>
        ))}
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="subtitle">{value}</Text>
      <Text variant="caption" color="muted">
        {label}
      </Text>
    </View>
  );
}

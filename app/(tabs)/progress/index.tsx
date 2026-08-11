import { View, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { CalendarHeatmap } from '@/components/charts/CalendarHeatmap';
import { VolumeBarChart } from '@/components/charts/VolumeBarChart';
import { useSessionActivityByDate, useVolumeByMuscleGroup } from '@/hooks/useProgress';
import { useExercises } from '@/hooks/useExercises';
import { spacing } from '@/lib/theme';

export default function ProgressOverview() {
  const router = useRouter();
  const { data: activity, isLoading: loadingActivity } = useSessionActivityByDate();
  const { data: volumeByMuscle, isLoading: loadingVolume } = useVolumeByMuscleGroup(7);
  const { data: loggedExercises } = useExercises({ customOnly: false });

  if (loadingActivity || loadingVolume) return <LoadingState />;

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <Card style={{ gap: spacing.sm }}>
          <Text variant="subtitle">Consistency</Text>
          <CalendarHeatmap
            activityByDate={activity ?? {}}
            onDayPress={(date) => router.push(`/(tabs)/progress/session-on/${date}` as any)}
          />
        </Card>

        <Card style={{ gap: spacing.sm }}>
          <Text variant="subtitle">This Week's Volume by Muscle Group</Text>
          <VolumeBarChart data={volumeByMuscle ?? []} />
        </Card>

        <View style={{ gap: spacing.sm }}>
          <Text variant="subtitle">Exercise History</Text>
          <FlatList
            data={loggedExercises}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Card onPress={() => router.push(`/(tabs)/progress/${item.id}/chart`)} style={{ marginBottom: spacing.sm }}>
                <Text weight="600">{item.name}</Text>
                <Text variant="caption" color="muted">
                  {item.category}
                </Text>
              </Card>
            )}
          />
        </View>

        <Card onPress={() => router.push('/(tabs)/progress/measurements')}>
          <Text weight="600">Body Measurements</Text>
          <Text variant="caption" color="muted">
            Track bodyweight, body fat %, and circumference
          </Text>
        </Card>
      </View>
    </Screen>
  );
}

import { View, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTodayPlan } from '@/hooks/useTodayPlan';
import { useRoutines } from '@/hooks/useRoutines';
import { useStartSession } from '@/hooks/useWorkoutSession';
import { supabase } from '@/lib/supabase';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { RoutineExerciseWithDetails } from '@/types/domain';

const QUICK_START_TYPES = [
  'Running', 'Yoga', 'Swimming', 'Boxing', 'Tennis', 'Weightlifting', 'Cycling', 'Soccer', 'Basketball', 'Hockey',
];

export default function AddWorkout() {
  const router = useRouter();
  const theme = useTheme();
  const { data: todayRoutines } = useTodayPlan();
  const { data: routines } = useRoutines();
  const startSession = useStartSession();

  async function handleStartRoutine(routineId: string) {
    const { data, error } = await supabase
      .from('routine_exercises')
      .select('*, exercise:exercises(*)')
      .eq('routine_id', routineId)
      .order('order_index');
    if (error) throw error;
    await startSession.mutateAsync({ routineId, routineExercises: data as unknown as RoutineExerciseWithDetails[] });
    router.push('/session/active');
  }

  async function handleQuickStart(workoutType: string) {
    await startSession.mutateAsync({ routineId: null, workoutType });
    router.push('/session/active');
  }

  return (
    <Screen scroll>
      <View style={{ gap: spacing.xl }}>
        <View style={{ gap: spacing.sm }}>
          <Text variant="subtitle">Today's Routine</Text>
          {todayRoutines && todayRoutines.length > 0 ? (
            todayRoutines.map((routine) => (
              <Card key={routine.id} onPress={() => handleStartRoutine(routine.id)}>
                <Text weight="600">{routine.name}</Text>
                <Text variant="caption" color="muted">
                  Tap to start
                </Text>
              </Card>
            ))
          ) : (
            <Card>
              <Text color="muted">Nothing scheduled today — pick a routine below or quick-start.</Text>
            </Card>
          )}
        </View>

        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="subtitle">My Routines</Text>
            <Pressable onPress={() => router.push('/(tabs)/add-workout/routines')}>
              <Text color="primary" weight="600" variant="caption">
                See all
              </Text>
            </Pressable>
          </View>
          {routines && routines.length > 0 ? (
            <FlatList
              horizontal
              data={routines}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
              renderItem={({ item }) => (
                <Card onPress={() => router.push(`/(tabs)/add-workout/routines/${item.id}`)} style={{ minWidth: 160 }}>
                  <Text weight="600">{item.name}</Text>
                  {item.folder ? (
                    <Text variant="caption" color="muted">
                      {item.folder}
                    </Text>
                  ) : null}
                </Card>
              )}
            />
          ) : (
            <Button label="Build Your First Routine" variant="secondary" onPress={() => router.push('/(tabs)/add-workout/routines/new')} fullWidth />
          )}
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="subtitle">Quick Start</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {QUICK_START_TYPES.map((type) => (
              <Pressable
                key={type}
                onPress={() => handleQuickStart(type)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.full,
                  backgroundColor: theme.surfaceAlt,
                }}
              >
                <Text weight="600" variant="caption">
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          onPress={() => router.push('/(tabs)/library')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm }}
        >
          <Ionicons name="barbell-outline" size={18} color={theme.textMuted} />
          <Text color="muted" weight="600">
            Manage Exercises
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

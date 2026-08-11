import { View, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { XpBar } from '@/components/gamification/XpBar';
import { StreakFlame } from '@/components/gamification/StreakFlame';
import { useUserLevel, useStreak } from '@/hooks/useGamification';
import { useTodayPlan } from '@/hooks/useTodayPlan';
import { useExercises } from '@/hooks/useExercises';
import { useStartSession } from '@/hooks/useWorkoutSession';
import { useAddExerciseToSession } from '@/hooks/useWorkoutSession';
import { supabase } from '@/lib/supabase';
import { spacing } from '@/lib/theme';
import type { RoutineExerciseWithDetails } from '@/types/domain';

export default function Home() {
  const router = useRouter();
  const { data: level } = useUserLevel();
  const { data: streak } = useStreak();
  const { data: todayRoutines, isLoading: loadingPlan } = useTodayPlan();
  const { data: favorites } = useExercises({ favoritesOnly: true });
  const startSession = useStartSession();
  const addExercise = useAddExerciseToSession();

  async function handleStartEmpty() {
    const newSession = await startSession.mutateAsync({ routineId: null });
    router.push('/session/active');
    void newSession;
  }

  async function handleStartRoutine(routineId: string) {
    const { data, error } = await supabase
      .from('routine_exercises')
      .select('*, exercise:exercises(*)')
      .eq('routine_id', routineId)
      .order('order_index');
    if (error) throw error;
    await startSession.mutateAsync({
      routineId,
      routineExercises: data as unknown as RoutineExerciseWithDetails[],
    });
    router.push('/session/active');
  }

  async function handleQuickLog(exerciseId: string) {
    const newSession = await startSession.mutateAsync({ routineId: null });
    await addExercise.mutateAsync({ sessionId: newSession.id, exerciseId, orderIndex: 0 });
    router.push('/session/active');
  }

  if (!level || !streak) return <LoadingState />;

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="title">GainsQuest</Text>
          <StreakFlame streak={streak} compact />
        </View>

        <Card>
          <XpBar level={level} />
        </Card>

        <Button label="Start Empty Workout" onPress={handleStartEmpty} loading={startSession.isPending} fullWidth />

        <View style={{ gap: spacing.sm }}>
          <Text variant="subtitle">Today's Plan</Text>
          {loadingPlan ? null : todayRoutines && todayRoutines.length > 0 ? (
            todayRoutines.map((routine) => (
              <Card key={routine.id} onPress={() => handleStartRoutine(routine.id)}>
                <Text weight="600">{routine.name}</Text>
                {routine.description ? (
                  <Text color="muted" variant="caption">
                    {routine.description}
                  </Text>
                ) : null}
              </Card>
            ))
          ) : (
            <Card>
              <Text color="muted">Nothing scheduled today. Build a routine and schedule it from the Routines tab.</Text>
            </Card>
          )}
        </View>

        {favorites && favorites.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="subtitle">Quick Log</Text>
            <FlatList
              horizontal
              data={favorites}
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
              renderItem={({ item }) => (
                <Card onPress={() => handleQuickLog(item.id)} style={{ minWidth: 140 }}>
                  <Text weight="600">{item.name}</Text>
                  <Text color="muted" variant="caption">
                    {item.category}
                  </Text>
                </Card>
              )}
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

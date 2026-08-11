import { useState } from 'react';
import { View, ScrollView, Alert, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SessionTimer } from '@/components/session/SessionTimer';
import { RestTimerBar } from '@/components/session/RestTimerBar';
import { ExerciseLogCard } from '@/components/session/ExerciseLogCard';
import { ExercisePicker } from '@/components/exercise/ExercisePicker';
import { useSessionStore } from '@/store/sessionStore';
import { useSessionExercises, useAddExerciseToSession, useCompleteSession, useDiscardSession } from '@/hooks/useWorkoutSession';
import { groupBySuperset } from '@/types/domain';
import { useTheme, spacing } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

export default function ActiveSession() {
  const router = useRouter();
  const theme = useTheme();
  const sessionId = useSessionStore((s) => s.sessionId);
  const isPaused = useSessionStore((s) => s.isPaused);
  const pause = useSessionStore((s) => s.pause);
  const resume = useSessionStore((s) => s.resume);
  const startRestTimer = useSessionStore((s) => s.startRestTimer);
  const pausedAccumulatedSeconds = useSessionStore((s) => s.pausedAccumulatedSeconds);
  const pausedAtMs = useSessionStore((s) => s.pausedAtMs);

  const { data: sessionExercises, isLoading } = useSessionExercises(sessionId);
  const addExercise = useAddExerciseToSession();
  const completeSession = useCompleteSession();
  const discardSession = useDiscardSession();

  const [pickerVisible, setPickerVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);

  if (!sessionId) {
    return (
      <Screen>
        <EmptyState
          icon="barbell-outline"
          title="No active workout"
          message="Start a workout from the Home tab first."
          actionLabel="Back to Home"
          onAction={() => router.replace('/(tabs)/home')}
        />
      </Screen>
    );
  }

  async function handleFinish() {
    setFinishing(true);
    try {
      const currentPauseSeconds = isPaused && pausedAtMs ? Math.floor((Date.now() - pausedAtMs) / 1000) : 0;
      await supabase
        .from('workout_sessions')
        .update({ paused_duration_seconds: pausedAccumulatedSeconds + currentPauseSeconds })
        .eq('id', sessionId!);

      const result = await completeSession.mutateAsync(sessionId!);
      router.replace({
        pathname: '/session/summary',
        params: {
          durationSeconds: String(result.duration_seconds),
          totalVolume: String(result.total_volume),
          totalSets: String(result.total_sets),
          xpEarned: String(result.xp_earned),
          leveledUp: String(result.leveled_up),
          newLevel: String(result.new_level),
          prs: JSON.stringify(result.prs),
          newBadges: JSON.stringify(result.new_badges),
        },
      });
    } finally {
      setFinishing(false);
    }
  }

  function handleDiscard() {
    Alert.alert('Discard workout?', 'This will delete the in-progress session. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardSession.mutateAsync(sessionId!);
          router.replace('/(tabs)/home');
        },
      },
    ]);
  }

  const groups = sessionExercises ? groupBySuperset(sessionExercises) : [];

  return (
    <Screen padded={false}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        }}
      >
        <Pressable onPress={handleDiscard} hitSlop={8}>
          <Ionicons name="close" size={26} color={theme.textMuted} />
        </Pressable>
        <SessionTimer />
        <Pressable onPress={isPaused ? resume : pause} hitSlop={8}>
          <Ionicons name={isPaused ? 'play-circle' : 'pause-circle'} size={28} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <RestTimerBar />

        {isLoading ? (
          <Text color="muted">Loading…</Text>
        ) : groups.length === 0 ? (
          <EmptyState icon="add-circle-outline" title="No exercises yet" message="Add an exercise to start logging." />
        ) : (
          groups.map((group) => (
            <View key={group.groupId ?? group.items[0].id} style={{ gap: spacing.sm }}>
              {group.items.length > 1 ? (
                <Text variant="label" color="primary" weight="700">
                  SUPERSET
                </Text>
              ) : null}
              {group.items.map((sessionExercise) => (
                <ExerciseLogCard
                  key={sessionExercise.id}
                  sessionExercise={sessionExercise}
                  sessionId={sessionId}
                  onStartRest={startRestTimer}
                />
              ))}
            </View>
          ))
        )}

        <Button label="+ Add Exercise" variant="secondary" onPress={() => setPickerVisible(true)} fullWidth />
        <Button label="Finish Workout" onPress={handleFinish} loading={finishing} fullWidth />
      </ScrollView>

      <ExercisePicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(exercise) => {
          addExercise.mutate({
            sessionId: sessionId!,
            exerciseId: exercise.id,
            orderIndex: (sessionExercises?.length ?? 0) + 1,
          });
        }}
      />
    </Screen>
  );
}

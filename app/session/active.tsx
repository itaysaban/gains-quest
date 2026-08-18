import { useEffect, useState } from 'react';
import { View, ScrollView, Alert, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { EmptyState } from '@/components/ui/EmptyState';
import { RestTimerBar } from '@/components/session/RestTimerBar';
import { ExerciseLogCard } from '@/components/session/ExerciseLogCard';
import { ExercisePicker } from '@/components/exercise/ExercisePicker';
import { useSessionStore } from '@/store/sessionStore';
import {
  useSessionExercises,
  useWorkoutSession,
  useAddExerciseToSession,
  useCompleteSession,
  useDiscardSession,
  useRemoveExerciseFromSession,
  useSwapSessionExercise,
} from '@/hooks/useWorkoutSession';
import { usePrefetchCurrentBestForSession } from '@/hooks/useExerciseCurrentBest';
import { useStaleSessionPrompt } from '@/hooks/useStaleSessionPrompt';
import { useProfile } from '@/hooks/useProfile';
import { groupBySuperset } from '@/types/domain';
import { useTheme, spacing, radius } from '@/lib/theme';
import { formatDuration } from '@/lib/utils/date';
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

  useStaleSessionPrompt();

  const { data: sessionExercises, isLoading } = useSessionExercises(sessionId);
  const { data: workoutSession } = useWorkoutSession(sessionId ?? undefined);
  const { data: profile } = useProfile();
  const addExercise = useAddExerciseToSession();
  const removeExercise = useRemoveExerciseFromSession();
  const swapExercise = useSwapSessionExercise();
  const completeSession = useCompleteSession();
  const discardSession = useDiscardSession();
  const prefetchCurrentBest = usePrefetchCurrentBestForSession();

  const [pickerVisible, setPickerVisible] = useState(false);
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!sessionExercises?.length) return;
    prefetchCurrentBest(sessionExercises.map((se) => se.exercise_id)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionExercises?.map((se) => se.exercise_id).join(',')]);

  if (!sessionId) {
    return (
      // presentation: 'fullScreenModal' screens get their own native view-controller hierarchy on
      // iOS that doesn't reliably inherit safe-area measurements from the root SafeAreaProvider in
      // app/_layout.tsx — a documented react-native-screens/expo-router gap. Each fullScreenModal
      // screen needs its own provider so its top inset (status bar / Dynamic Island) resolves
      // correctly instead of reading as 0.
      <SafeAreaProvider>
        <Screen>
          <EmptyState
            icon="barbell-outline"
            title="No active workout"
            message="Start a workout from the Home tab first."
            actionLabel="Back to Home"
            onAction={() => router.dismissTo('/(tabs)/home')}
          />
        </Screen>
      </SafeAreaProvider>
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
          sessionId: sessionId!,
          durationSeconds: String(result.duration_seconds),
          totalVolume: String(result.total_volume),
          totalSets: String(result.total_sets),
          pointsEarned: String(result.points_earned),
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
          router.dismissTo('/(tabs)/home');
        },
      },
    ]);
  }

  function handleRemoveExercise(sessionExerciseId: string, hasLoggedSets: boolean) {
    if (hasLoggedSets) {
      Alert.alert('Remove exercise?', 'This exercise has logged sets — removing it deletes them too.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeExercise.mutate({ id: sessionExerciseId, sessionId: sessionId! }),
        },
      ]);
      return;
    }
    removeExercise.mutate({ id: sessionExerciseId, sessionId: sessionId! });
  }

  const groups = sessionExercises ? groupBySuperset(sessionExercises) : [];
  const liveVolume = (sessionExercises ?? [])
    .flatMap((se) => se.sets)
    .filter((s) => s.set_type !== 'warmup')
    .reduce((sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 1), 0);

  return (
    // See the SafeAreaProvider note on the "no active workout" return above — same reasoning.
    <SafeAreaProvider>
    <Screen padded={false}>
      <View
        style={{
          backgroundColor: theme.chrome,
          paddingTop: spacing.xl,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
        }}
      >
        <Pressable onPress={handleDiscard} hitSlop={8}>
          <Text font="body" weight="700" size={20} color="secondary">
            ✕
          </Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <ActiveSessionHeaderTitle name={workoutSession?.name ?? 'Workout'} isPaused={isPaused} liveVolume={liveVolume} />
        </View>
        <Pressable onPress={isPaused ? resume : pause} hitSlop={8}>
          <Text style={{ fontSize: 20 }}>{isPaused ? '▶️' : '⏸️'}</Text>
        </Pressable>
        <Pressable
          onPress={handleFinish}
          disabled={finishing}
          style={{ backgroundColor: theme.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, opacity: finishing ? 0.6 : 1 }}
        >
          <Text font="body" weight="700" size={13} style={{ color: theme.onAccent }}>
            {finishing ? '…' : 'Finish'}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}>
        <RestTimerBar />

        {isLoading || !profile ? (
          <Text color="muted">Loading…</Text>
        ) : groups.length === 0 ? (
          <EmptyState icon="add-circle-outline" title="No exercises yet" message="Add an exercise to start logging." />
        ) : (
          groups.map((group) => (
            <View key={group.groupId ?? group.items[0].id} style={{ gap: spacing.sm }}>
              {group.items.length > 1 ? (
                <Text font="mono" size={10} color="primary" weight="700" style={{ letterSpacing: 1.5 }}>
                  SUPERSET
                </Text>
              ) : null}
              {group.items.map((sessionExercise) => (
                <ExerciseLogCard
                  key={sessionExercise.id}
                  sessionExercise={sessionExercise}
                  sessionId={sessionId}
                  unit={profile.unit_preference}
                  onStartRest={startRestTimer}
                  onRemove={() => handleRemoveExercise(sessionExercise.id, sessionExercise.sets.length > 0)}
                  onRequestSwap={() => {
                    setSwapTargetId(sessionExercise.id);
                    setPickerVisible(true);
                  }}
                />
              ))}
            </View>
          ))
        )}

        <Pressable
          onPress={() => setPickerVisible(true)}
          style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: theme.borderSubtle, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center' }}
        >
          <Text font="body" weight="600" size={13} color="secondary">
            ＋ Add exercise
          </Text>
        </Pressable>
      </ScrollView>

      <ExercisePicker
        visible={pickerVisible}
        onClose={() => {
          setPickerVisible(false);
          setSwapTargetId(null);
        }}
        onSelect={(exercise) => {
          if (swapTargetId) {
            swapExercise.mutate({ id: swapTargetId, sessionId: sessionId!, newExerciseId: exercise.id });
          } else {
            addExercise.mutate({
              sessionId: sessionId!,
              exerciseId: exercise.id,
              orderIndex: (sessionExercises?.length ?? 0) + 1,
            });
          }
        }}
      />
    </Screen>
    </SafeAreaProvider>
  );
}

/** Header's "routine name / live mm:ss · kg" line — design handoff §3. Re-derives elapsedSeconds()
 * every second the same way SessionTimer did (a store method, not reactive state on its own). */
function ActiveSessionHeaderTitle({ name, isPaused, liveVolume }: { name: string; isPaused: boolean; liveVolume: number }) {
  const theme = useTheme();
  const elapsedSeconds = useSessionStore((s) => s.elapsedSeconds);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={{ gap: 2 }}>
      <Text font="body" weight="700" size={17} numberOfLines={1}>
        {name}
      </Text>
      <Text font="mono" size={12} style={{ color: theme.gradientFrom }}>
        {formatDuration(elapsedSeconds())} · {Math.round(liveVolume).toLocaleString()} kg
        {isPaused ? ' · paused' : ''}
      </Text>
    </View>
  );
}

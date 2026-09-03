import { useRef } from 'react';
import { View, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { LoadingState } from '@/components/ui/LoadingState';
import { useTodayPlan } from '@/hooks/useTodayPlan';
import { useRoutines, useRoutineExercises } from '@/hooks/useRoutines';
import { useProfile } from '@/hooks/useProfile';
import { useStartSession } from '@/hooks/useWorkoutSession';
import { ChallengesSection } from '@/components/social/ChallengesSection';
import { supabase } from '@/lib/supabase';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { RoutineExerciseWithDetails } from '@/types/domain';

// workoutType (passed to fn_start_session, stored on workout_sessions.workout_type — badge criteria
// like distinct_workout_types_in_week key off this exact string) stays unchanged from before this
// redesign; icon/label are display-only.
const QUICK_START_TYPES: { workoutType: string; icon: string; label: string }[] = [
  { workoutType: 'Weightlifting', icon: '🏋️', label: 'Gym' },
  { workoutType: 'Yoga', icon: '🧘', label: 'Yoga' },
  { workoutType: 'Running', icon: '🏃', label: 'Run' },
  { workoutType: 'Cycling', icon: '🚴', label: 'Cycle' },
  { workoutType: 'Swimming', icon: '🏊', label: 'Swim' },
  { workoutType: 'Boxing', icon: '🥊', label: 'Boxing' },
  { workoutType: 'Tennis', icon: '🎾', label: 'Tennis' },
  { workoutType: 'Soccer', icon: '⚽', label: 'Soccer' },
  { workoutType: 'Basketball', icon: '🏀', label: 'Basketball' },
  { workoutType: 'Hockey', icon: '🏒', label: 'Hockey' },
];

/** Add Workout — design handoff §2 / PRD §7.3, restructured per the PRD's own verdict ("needs
 * restructuring — no route from here to building a routine"): Today's routine → My routines → Quick
 * start → Daily Quests. Daily Quests (F6/§6.6, M4 Story 4, redesigned 2026-09-01) lives here as a
 * section rather than a 5th bottom tab, per the user's own navigation call — a fixed daily pool from
 * fn_active_challenges, not personalized/inferred. */
export default function AddWorkout() {
  const router = useRouter();
  const theme = useTheme();
  const quickStartRef = useRef<FlatList>(null);
  const { data: profile } = useProfile();
  const { data: todayRoutines, isLoading: loadingPlan } = useTodayPlan();
  const { data: routines } = useRoutines();
  const startSession = useStartSession();

  const todayRoutine = todayRoutines?.[0];
  const { data: todayRoutineExercises } = useRoutineExercises(todayRoutine?.id);

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

  if (!profile) return <LoadingState />;

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        {loadingPlan ? null : todayRoutine ? (
          <View style={{ gap: spacing.sm }}>
            <Text font="mono" size={13} color="muted" style={{ letterSpacing: 1.5 }}>
              TODAY&apos;S ROUTINE
            </Text>
            <Pressable onPress={() => handleStartRoutine(todayRoutine.id)} disabled={startSession.isPending}>
              <LinearGradient
                colors={[theme.gradientFrom, theme.gradientTo]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md }}
              >
                <View style={{ gap: 5 }}>
                  <Text font="display" size={30} style={{ color: theme.onAccent }}>
                    {todayRoutine.name}
                  </Text>
                  {todayRoutineExercises && todayRoutineExercises.length > 0 ? (
                    <Text font="body" weight="500" size={13} style={{ color: 'rgba(24,13,2,0.72)' }}>
                      {todayRoutineExercises.map((re) => re.exercise.name).join(' · ')}
                    </Text>
                  ) : null}
                </View>
                <View
                  style={{
                    backgroundColor: theme.onAccent,
                    borderRadius: radius.md,
                    padding: spacing.md,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.xs,
                  }}
                >
                  <Text style={{ color: theme.gradientFrom, fontSize: 15 }}>▶</Text>
                  <Text font="body" weight="700" size={16} style={{ color: '#FFFFFF' }}>
                    Start session
                  </Text>
                </View>
              </LinearGradient>
            </Pressable>
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text font="mono" size={13} color="muted" style={{ letterSpacing: 1.5 }}>
              MY ROUTINES
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/add-workout/routines')}>
              <Text font="body" weight="600" size={12} color="primary">
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
              style={{ marginHorizontal: -spacing.lg }}
              contentContainerStyle={{ paddingHorizontal: spacing.lg }}
              ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
              ListFooterComponent={
                <Pressable
                  onPress={() => router.push('/(tabs)/add-workout/routines/new')}
                  style={{
                    width: 104,
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: theme.borderSubtle,
                    borderRadius: radius.lg,
                    padding: spacing.md,
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Text style={{ fontSize: 18, color: theme.primary }}>＋</Text>
                  <Text font="body" weight="600" size={13} color="secondary">
                    New routine
                  </Text>
                </Pressable>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => router.push(`/(tabs)/add-workout/routines/${item.id}`)}
                  style={{ width: 128, backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs }}
                >
                  <Text font="display" size={17} style={{ lineHeight: 18 }}>
                    {item.name}
                  </Text>
                  {item.folder ? (
                    <Text font="body" size={12} color="muted">
                      {item.folder}
                    </Text>
                  ) : null}
                </Pressable>
              )}
            />
          ) : (
            <Pressable
              onPress={() => router.push('/(tabs)/add-workout/routines/new')}
              style={{
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: theme.borderSubtle,
                borderRadius: radius.lg,
                padding: spacing.lg,
                alignItems: 'center',
              }}
            >
              <Text font="body" weight="600" size={14} color="primary">
                ＋ Build Your First Routine
              </Text>
            </Pressable>
          )}
        </View>

        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
            <Text font="mono" size={13} color="muted" style={{ letterSpacing: 1.5 }}>
              QUICK START
            </Text>
            <Pressable
              onPress={() => quickStartRef.current?.scrollToEnd({ animated: true })}
              style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text font="body" weight="600" size={12} color="primary">
                See all
              </Text>
              <Text style={{ color: theme.primary, fontSize: 12 }}>›</Text>
            </Pressable>
          </View>
          <FlatList
            ref={quickStartRef}
            horizontal
            data={QUICK_START_TYPES}
            keyExtractor={(item) => item.workoutType}
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -spacing.lg }}
            contentContainerStyle={{ paddingHorizontal: spacing.lg }}
            ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => handleQuickStart(item.workoutType)}
                style={{
                  width: 72,
                  backgroundColor: theme.surface,
                  borderRadius: radius.xl,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.sm,
                  alignItems: 'center',
                  gap: spacing.sm,
                }}
              >
                <Text style={{ fontSize: 21 }}>{item.icon}</Text>
                <Text font="body" weight="500" size={13} style={{ color: '#C9C9E0' }}>
                  {item.label}
                </Text>
              </Pressable>
            )}
          />
        </View>

        <ChallengesSection />

        <Pressable
          onPress={() => router.push('/(tabs)/library')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm }}
        >
          <Text font="body" color="muted" weight="600">
            Manage Exercises
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

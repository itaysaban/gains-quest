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

const QUICK_START_TYPES = [
  'Running', 'Yoga', 'Swimming', 'Boxing', 'Tennis', 'Weightlifting', 'Cycling', 'Soccer', 'Basketball', 'Hockey',
];

/** Add Workout — design handoff §2 / PRD §7.3, restructured per the PRD's own verdict ("needs
 * restructuring — no route from here to building a routine"): Today's routine → My routines → Quick
 * start → Challenges. Challenges (F6, M4 Story 4) lives here as a section rather than a 5th bottom
 * tab, per the user's own navigation call — a fixed weekly pool from fn_active_challenges, not
 * personalized/inferred. */
export default function AddWorkout() {
  const router = useRouter();
  const theme = useTheme();
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.xs }}>
          <LinearGradient
            colors={[theme.gradientFrom, theme.gradientTo]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ width: 42, height: 42, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text font="body" weight="700" size={17}>
              {(profile.display_name ?? 'A').charAt(0).toUpperCase()}
            </Text>
          </LinearGradient>
          <View>
            <Text font="body" weight="700" size={17}>
              Hello, {profile.display_name ?? 'Athlete'}!
            </Text>
            <Text font="body" size={13} color="secondary">
              Let&apos;s crush it
            </Text>
          </View>
        </View>

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
              ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
              ListFooterComponent={
                <Pressable
                  onPress={() => router.push('/(tabs)/add-workout/routines/new')}
                  style={{
                    minWidth: 110,
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
                  style={{ minWidth: 150, backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs }}
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
          <Text font="mono" size={13} color="muted" style={{ letterSpacing: 1.5 }}>
            QUICK START
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {QUICK_START_TYPES.map((type) => (
              <Pressable
                key={type}
                onPress={() => handleQuickStart(type)}
                style={{ paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.md, backgroundColor: theme.surface }}
              >
                <Text font="body" weight="600" size={13}>
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text font="mono" size={13} color="muted" style={{ letterSpacing: 1.5 }}>
            CHALLENGES
          </Text>
          <ChallengesSection />
        </View>

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

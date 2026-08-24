import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { LoadingState } from '@/components/ui/LoadingState';
import { useLifetimeStats, useStreak } from '@/hooks/useGamification';
import { useTodayPlan } from '@/hooks/useTodayPlan';
import { useRoutineExercises } from '@/hooks/useRoutines';
import { useProfile } from '@/hooks/useProfile';
import { useStartSession } from '@/hooks/useWorkoutSession';
import { useStreakReminder } from '@/hooks/useStreakReminder';
import { supabase } from '@/lib/supabase';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { RoutineExerciseWithDetails } from '@/types/domain';

/** Home — design handoff §1 / PRD §6.5. Rank tile is a static "—" placeholder (same pattern as
 * Achievement Hall's LIFETIME card Season rank) — tiers/leaderboards don't exist yet (M4). Social
 * Feed is dropped entirely for the same reason: there's no friends/activity backend to read from,
 * and a hardcoded feed would misrepresent real functionality. */
export default function Home() {
  const router = useRouter();
  const theme = useTheme();
  const { data: profile } = useProfile();
  const { data: lifetimeStats } = useLifetimeStats();
  const { data: streak } = useStreak();
  const { data: todayRoutines, isLoading: loadingPlan } = useTodayPlan();
  const startSession = useStartSession();
  useStreakReminder();

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

  if (!lifetimeStats || !streak) return <LoadingState />;

  return (
    <Screen scroll>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: spacing.xs }}>
          <Pressable onPress={() => router.push('/(tabs)/settings')} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <LinearGradient
              colors={[theme.gradientFrom, theme.gradientTo]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: 42, height: 42, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text font="body" weight="700" size={17}>
                {(profile?.display_name ?? 'A').charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
            <View>
              <Text font="body" weight="700" size={17}>
                Hello, {profile?.display_name ?? 'Athlete'}!
              </Text>
              <Text font="body" size={13} color="secondary">
                Let&apos;s crush it
              </Text>
            </View>
          </Pressable>

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Pressable
              onPress={() => router.push('/(tabs)/settings/friends')}
              style={{ width: 38, height: 38, borderRadius: radius.md, backgroundColor: theme.cardInset, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 17 }}>👥</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push('/(tabs)/settings/notifications')}
              style={{ width: 38, height: 38, borderRadius: radius.md, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 17 }}>🔔</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatTile emoji="⚡" label="Points" value={lifetimeStats.total_gp.toLocaleString()} onPress={() => router.push('/(tabs)/leaderboard')} />
          <StatTile
            emoji="🏆"
            label="Tier rank"
            value={lifetimeStats.season_rank != null ? `#${lifetimeStats.season_rank}` : '—'}
            onPress={() => router.push('/(tabs)/leaderboard')}
          />
          <StatTile emoji="🔥" label="Day streak" value={String(streak.current_streak_days)} onPress={() => router.push('/(tabs)/achievements')} />
        </View>

        {loadingPlan ? null : todayRoutine ? (
          <Pressable onPress={() => handleStartRoutine(todayRoutine.id)} disabled={startSession.isPending}>
            <LinearGradient
              colors={[theme.gradientFrom, theme.gradientTo]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: radius.xl, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
            >
              <View style={{ flex: 1, gap: 5 }}>
                <Text font="mono" size={11} style={{ color: 'rgba(24,13,2,0.6)', letterSpacing: 1.5 }}>
                  TODAY · {todayRoutine.name.toUpperCase()}
                </Text>
                <Text font="display" size={26} style={{ color: theme.onAccent }}>
                  {todayRoutine.name}
                </Text>
                <Text font="body" weight="500" size={13} style={{ color: 'rgba(24,13,2,0.7)' }}>
                  {todayRoutineExercises?.length ?? 0} exercises
                </Text>
              </View>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: radius.full,
                  backgroundColor: theme.onAccent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 20, color: theme.gradientFrom }}>▶</Text>
              </View>
            </LinearGradient>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/(tabs)/add-workout')}
            style={{ backgroundColor: theme.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.xs }}
          >
            <Text font="body" weight="600" size={15}>
              Nothing scheduled today
            </Text>
            <Text font="body" size={13} color="secondary">
              Tap to pick a routine or quick-start a workout
            </Text>
          </Pressable>
        )}
      </View>
    </Screen>
  );
}

function StatTile({ emoji, label, value, onPress }: { emoji: string; label: string; value: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.md, gap: 6 }}
    >
      <Text style={{ fontSize: 16 }}>{emoji}</Text>
      <Text font="display" size={22}>
        {value}
      </Text>
      <Text font="body" weight="500" size={11} color="muted">
        {label}
      </Text>
    </Pressable>
  );
}

import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { XpBar } from '@/components/gamification/XpBar';
import { useUserLevel, useStreak } from '@/hooks/useGamification';
import { useTodayPlan } from '@/hooks/useTodayPlan';
import { useProfile } from '@/hooks/useProfile';
import { useStartSession } from '@/hooks/useWorkoutSession';
import { useStreakReminder } from '@/hooks/useStreakReminder';
import { supabase } from '@/lib/supabase';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { RoutineExerciseWithDetails } from '@/types/domain';

export default function Home() {
  const router = useRouter();
  const theme = useTheme();
  const { data: profile } = useProfile();
  const { data: level } = useUserLevel();
  const { data: streak } = useStreak();
  const { data: todayRoutines, isLoading: loadingPlan } = useTodayPlan();
  const startSession = useStartSession();
  useStreakReminder();

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

  if (!level || !streak) return <LoadingState />;

  const todayRoutine = todayRoutines?.[0];

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => router.push('/(tabs)/settings')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: radius.full,
                backgroundColor: theme.primary,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="person" size={22} color="#FFFFFF" />
            </View>
            <View>
              <Text weight="700">Hello, {profile?.display_name ?? 'Athlete'}!</Text>
              <Text variant="caption" color="muted">
                Let's Crush it! 💪
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/settings/notifications')}
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.full,
              backgroundColor: theme.primaryMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="notifications" size={18} color={theme.primary} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <StatTile icon="star" label="Points" value={level.total_xp.toLocaleString()} onPress={() => router.push('/(tabs)/achievements')} />
          <StatTile icon="flame" label="Streak" value={`${streak.current_streak_days}d`} onPress={() => router.push('/(tabs)/achievements')} />
        </View>

        <Card>
          <XpBar level={level} />
        </Card>

        <View style={{ gap: spacing.sm }}>
          <Text variant="subtitle">Start Today's Routine</Text>
          {loadingPlan ? null : todayRoutine ? (
            <Card onPress={() => handleStartRoutine(todayRoutine.id)} style={{ gap: spacing.xs }}>
              <Text weight="700" variant="subtitle">
                {todayRoutine.name}
              </Text>
              <Button label="Start" onPress={() => handleStartRoutine(todayRoutine.id)} loading={startSession.isPending} />
            </Card>
          ) : (
            <Card style={{ gap: spacing.sm }}>
              <Text color="muted">Nothing scheduled today.</Text>
              <Button label="Go to Add Workout" variant="secondary" onPress={() => router.push('/(tabs)/add-workout')} />
            </Card>
          )}
        </View>
      </View>
    </Screen>
  );
}

function StatTile({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: theme.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: theme.border,
        padding: spacing.md,
        alignItems: 'center',
        gap: 4,
      }}
    >
      <Ionicons name={icon} size={20} color={theme.primary} />
      <Text weight="700">{value}</Text>
      <Text variant="label" color="muted">
        {label}
      </Text>
    </Pressable>
  );
}

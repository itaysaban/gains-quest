import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { LoadingState } from '@/components/ui/LoadingState';
import { StreakHeroCard } from '@/components/gamification/StreakHeroCard';
import { LifetimeCard } from '@/components/gamification/LifetimeCard';
import { AchievementList } from '@/components/gamification/AchievementList';
import {
  useStreak,
  useAllBadges,
  useUserBadges,
  useLifetimeStats,
  useBadgeProgress,
  usePauseDaysUsedThisQuarter,
} from '@/hooks/useGamification';
import { useProfile } from '@/hooks/useProfile';
import { useTheme, spacing, radius } from '@/lib/theme';

/** Achievement Hall — design handoff (design_handoff_gainquest), §7 / PRD §6.4, M3 Epic 3 Story 3.3.
 * Streak card (rest allowance, freezes, Pause availability) + LIFETIME totals + the full badge grid
 * with live progress on locked badges. Season rank is an M4 placeholder ("—") — seasonal leaderboards
 * don't exist yet. */
export default function Achievements() {
  const router = useRouter();
  const theme = useTheme();
  const { data: profile } = useProfile();
  const { data: streak } = useStreak();
  const { data: allBadges, isLoading: loadingBadges } = useAllBadges();
  const { data: userBadges } = useUserBadges();
  const { data: lifetimeStats } = useLifetimeStats();
  const { data: badgeProgress } = useBadgeProgress();
  const { data: pauseDaysUsed } = usePauseDaysUsedThisQuarter();

  if (!profile || !streak || loadingBadges || !lifetimeStats || !badgeProgress || pauseDaysUsed === undefined) {
    return <LoadingState />;
  }

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
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/settings/notifications')}
            style={{ width: 38, height: 38, borderRadius: radius.md, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 17 }}>🔔</Text>
          </Pressable>
        </View>

        <Text font="display" size={34}>
          Achievement Hall
        </Text>

        <StreakHeroCard streak={streak} weeklyGoalDays={profile.weekly_goal_days} pauseDaysUsedThisQuarter={pauseDaysUsed} />

        <LifetimeCard stats={lifetimeStats} />

        <AchievementList badges={allBadges ?? []} userBadges={userBadges ?? []} progress={badgeProgress} />

        <Pressable
          onPress={() => router.push('/(tabs)/progress')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm }}
        >
          <Text color="muted" weight="600">
            View Full Progress Dashboard
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

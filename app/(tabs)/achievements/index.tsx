import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { LoadingState } from '@/components/ui/LoadingState';
import { XpBar } from '@/components/gamification/XpBar';
import { StreakHeroCard } from '@/components/gamification/StreakHeroCard';
import { AchievementList } from '@/components/gamification/AchievementList';
import { useUserLevel, useStreak, useAllBadges, useUserBadges } from '@/hooks/useGamification';
import { useProfile } from '@/hooks/useProfile';
import { useTheme, spacing, radius } from '@/lib/theme';

export default function Achievements() {
  const router = useRouter();
  const theme = useTheme();
  const { data: profile } = useProfile();
  const { data: level } = useUserLevel();
  const { data: streak } = useStreak();
  const { data: allBadges, isLoading: loadingBadges } = useAllBadges();
  const { data: userBadges } = useUserBadges();

  if (!level || !streak || loadingBadges) return <LoadingState />;

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

        <Text variant="title">Achievement Hall</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text color="muted" variant="caption" weight="600">
            LEVEL {level.current_level}
          </Text>
          <Text color="muted" variant="caption">
            {level.total_xp.toLocaleString()} total pts
          </Text>
        </View>
        <XpBar level={level} />

        <StreakHeroCard streak={streak} />

        <View style={{ gap: spacing.sm }}>
          <Text variant="subtitle">Achievements</Text>
          <AchievementList badges={allBadges ?? []} userBadges={userBadges ?? []} />
        </View>

        <Pressable
          onPress={() => router.push('/(tabs)/progress')}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm }}
        >
          <Ionicons name="trending-up" size={18} color={theme.textMuted} />
          <Text color="muted" weight="600">
            View Full Progress Dashboard
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

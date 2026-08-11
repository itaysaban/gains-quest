import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { XpBar } from '@/components/gamification/XpBar';
import { StreakFlame } from '@/components/gamification/StreakFlame';
import { BadgeGrid } from '@/components/gamification/BadgeGrid';
import { useUserLevel, useStreak, useAllBadges, useUserBadges } from '@/hooks/useGamification';
import { useProfile } from '@/hooks/useProfile';
import { useTheme, spacing } from '@/lib/theme';

export default function Profile() {
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
        <View style={{ alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              backgroundColor: theme.primaryMuted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="person" size={36} color={theme.primary} />
          </View>
          <Text variant="title">{profile?.display_name ?? 'Athlete'}</Text>
        </View>

        <Card>
          <XpBar level={level} />
        </Card>

        <Card style={{ alignItems: 'center', gap: spacing.xs }}>
          <Text variant="label" color="muted" weight="600">
            CURRENT STREAK
          </Text>
          <StreakFlame streak={streak} />
          <Text variant="caption" color="muted">
            Longest: {streak.longest_streak_days} days
          </Text>
        </Card>

        <View style={{ gap: spacing.sm }}>
          <Text variant="subtitle">Badges</Text>
          <BadgeGrid badges={allBadges ?? []} userBadges={userBadges ?? []} />
        </View>
      </View>
    </Screen>
  );
}

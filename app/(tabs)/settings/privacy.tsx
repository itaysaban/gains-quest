import { View, Switch } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { spacing } from '@/lib/theme';

/** M5 (Polish) — PRD §9's only concrete privacy requirement: "Leaderboard participation can be
 * turned off entirely without losing points or badges." A pure ranking-visibility toggle — GP,
 * personal records, and badges are never affected; fn_leaderboard excludes an opted-out user from
 * both boards' ranking pool entirely (not just hidden with a rank gap left behind) but still lets
 * them view either board themselves. */
export default function PrivacySettings() {
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  if (!profile) return null;

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 2, marginRight: spacing.md }}>
            <Text weight="600">Hide me from leaderboards</Text>
            <Text color="muted" variant="caption">
              You keep earning GainPoints and unlocking badges as normal — you just won&apos;t appear on the Global or Friends
              boards, for anyone including yourself. You can still view both boards.
            </Text>
          </View>
          <Switch
            value={profile.leaderboard_opt_out}
            onValueChange={(v) => updateProfile.mutate({ leaderboard_opt_out: v })}
          />
        </View>
      </View>
    </Screen>
  );
}

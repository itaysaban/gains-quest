import { View, Pressable } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useProfile, useUpdateProfile } from '@/hooks/useProfile';
import { useTheme, spacing, radius } from '@/lib/theme';

export default function WeeklyGoalSettings() {
  const theme = useTheme();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <Text color="muted">How many days a week do you want to train? This drives your streak and quest targets.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => {
            const active = profile?.weekly_goal_days === n;
            return (
              <Pressable
                key={n}
                onPress={() => updateProfile.mutate({ weekly_goal_days: n })}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: radius.full,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? theme.primary : theme.surfaceAlt,
                }}
              >
                <Text weight="700" style={{ color: active ? '#FFF' : theme.text }}>
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

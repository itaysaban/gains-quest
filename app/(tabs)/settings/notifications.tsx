import { useEffect, useState } from 'react';
import { View, Switch, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { useStreak } from '@/hooks/useGamification';
import { useProfile } from '@/hooks/useProfile';
import { evaluateStreakReminder, streakNotificationContent } from '@/lib/notifications/streakReminder';
import { spacing } from '@/lib/theme';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function NotificationSettings() {
  const { data: prefs } = useNotificationPreferences();
  const updatePrefs = useUpdateNotificationPreferences();
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);

  useEffect(() => {
    Notifications.getPermissionsAsync().then((res) => setPermissionGranted(res.granted));
  }, []);

  async function requestPermission() {
    const res = await Notifications.requestPermissionsAsync();
    setPermissionGranted(res.granted);
  }

  if (!prefs) return null;

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        {permissionGranted === false ? (
          <View style={{ gap: spacing.sm }}>
            <Text color="muted">Notifications are currently disabled at the OS level.</Text>
            <Button label="Enable Notifications" onPress={requestPermission} />
          </View>
        ) : null}

        <ToggleRow
          label="Rest timer alerts"
          value={prefs.rest_timer_enabled}
          onChange={(v) => updatePrefs.mutate({ rest_timer_enabled: v })}
        />
        <ToggleRow
          label="Routine reminders"
          value={prefs.routine_reminders_enabled}
          onChange={(v) => updatePrefs.mutate({ routine_reminders_enabled: v })}
        />
        <ToggleRow
          label="Streak warnings"
          value={prefs.streak_warnings_enabled}
          onChange={(v) => updatePrefs.mutate({ streak_warnings_enabled: v })}
        />

        {__DEV__ ? <DevTestStreakNotificationButton /> : null}
      </View>
    </Screen>
  );
}

/** Dev-only: fires the exact streak notification (reminder or at-risk, with the real copy) that
 * evaluateStreakReminder would produce for your current state, immediately instead of waiting for the
 * scheduled time — the newer Hermes-based debugger console can't reach Metro's `require`, so this
 * replaces the old "paste a snippet into the remote JS console" way of testing this. Not wired into
 * production builds. */
function DevTestStreakNotificationButton() {
  const { data: streak } = useStreak();
  const { data: profile } = useProfile();

  async function handleTest() {
    if (!streak || !profile) return;
    const kind = evaluateStreakReminder({ streak, weeklyGoalDays: profile.weekly_goal_days });
    if (kind === 'none') {
      Alert.alert(
        'No notification would fire',
        "Your current state (already trained today, Pause Mode active, or rest allowance/freezes still available) means neither notification would fire right now.",
      );
      return;
    }
    await Notifications.scheduleNotificationAsync({ content: streakNotificationContent(kind), trigger: null });
  }

  return <Button label="Test Streak Notification (dev)" variant="secondary" onPress={handleTest} />;
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text weight="600">{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

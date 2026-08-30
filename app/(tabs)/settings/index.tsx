import { View, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useProfile } from '@/hooks/useProfile';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useTheme, spacing } from '@/lib/theme';

const ROWS: { label: string; route: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Units', route: '/(tabs)/settings/units', icon: 'scale-outline' },
  { label: 'Weekly Goal', route: '/(tabs)/settings/weekly-goal', icon: 'flag-outline' },
  { label: 'Pause Mode', route: '/(tabs)/settings/pause-mode', icon: 'pause-circle-outline' },
  { label: 'Notifications', route: '/(tabs)/settings/notifications', icon: 'notifications-outline' },
  { label: 'Friends', route: '/(tabs)/settings/friends', icon: 'people-outline' },
  { label: 'Privacy', route: '/(tabs)/settings/privacy', icon: 'eye-off-outline' },
];

export default function Settings() {
  const router = useRouter();
  const theme = useTheme();
  const { data: profile } = useProfile();
  const { signOut } = useAuth();

  function handleSignOut() {
    Alert.alert('Log out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: signOut },
    ]);
  }

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <View>
          <Text variant="subtitle">{profile?.display_name}</Text>
          <Text color="muted" variant="caption">
            {profile?.timezone}
          </Text>
        </View>

        <View style={{ gap: spacing.xs }}>
          {ROWS.map((row) => (
            <Pressable
              key={row.route}
              onPress={() => router.push(row.route as any)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: spacing.md,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name={row.icon} size={20} color={theme.text} />
                <Text weight="600">{row.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
            </Pressable>
          ))}
        </View>

        <Pressable onPress={handleSignOut} style={{ paddingVertical: spacing.md }}>
          <Text color="danger" weight="600">
            Log Out
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

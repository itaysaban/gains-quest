import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';

export default function SettingsLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: theme.background }, headerTintColor: theme.text, headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: 'Settings', headerLeft: () => <HeaderBackButton /> }} />
      <Stack.Screen name="units" options={{ title: 'Units' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="weekly-goal" options={{ title: 'Weekly Goal' }} />
    </Stack>
  );
}

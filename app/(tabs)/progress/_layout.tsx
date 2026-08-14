import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';

export default function ProgressLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Progress', headerLeft: () => <HeaderBackButton /> }} />
      <Stack.Screen name="measurements" options={{ title: 'Body Measurements' }} />
      <Stack.Screen name="[exerciseId]/chart" options={{ title: 'Progression', headerLeft: () => <HeaderBackButton /> }} />
      <Stack.Screen name="session-on/[date]" options={{ title: 'Sessions' }} />
      <Stack.Screen name="session/[sessionId]" options={{ title: 'Session' }} />
    </Stack>
  );
}

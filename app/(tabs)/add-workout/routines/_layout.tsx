import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

export default function RoutinesLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Routines' }} />
      <Stack.Screen name="new" options={{ title: 'New Routine', presentation: 'modal' }} />
      <Stack.Screen name="[routineId]/index" options={{ title: 'Routine' }} />
      <Stack.Screen name="[routineId]/schedule" options={{ title: 'Schedule' }} />
    </Stack>
  );
}

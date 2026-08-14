import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

export default function AddWorkoutLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Add Workout' }} />
      <Stack.Screen name="routines" options={{ headerShown: false }} />
    </Stack>
  );
}

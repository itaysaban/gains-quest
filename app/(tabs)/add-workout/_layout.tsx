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
      {/* No native header on the tab root — same reasoning as the Achievements stack: the screen's
          own sections are the heading, and a native title bar just duplicates the tab label. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="routines" options={{ headerShown: false }} />
    </Stack>
  );
}

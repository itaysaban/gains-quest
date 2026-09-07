import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

export default function AchievementsLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: theme.background }, headerTintColor: theme.text, headerShadowVisible: false }}>
      {/* No native header on the tab root: the screen renders its own "Achievement Hall" heading in
          the app's own type, so the header was a second, differently-styled title above it. Nested
          screens still inherit the header options above. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
    </Stack>
  );
}

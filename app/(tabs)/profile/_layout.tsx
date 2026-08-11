import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

export default function ProfileLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: theme.background }, headerTintColor: theme.text, headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ title: 'Profile' }} />
    </Stack>
  );
}

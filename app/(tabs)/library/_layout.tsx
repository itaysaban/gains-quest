import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { HeaderBackButton } from '@/components/ui/HeaderBackButton';

export default function LibraryLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Exercise Library', headerLeft: () => <HeaderBackButton /> }} />
      <Stack.Screen name="new" options={{ title: 'New Exercise', presentation: 'modal' }} />
      <Stack.Screen name="[exerciseId]" options={{ title: 'Exercise' }} />
    </Stack>
  );
}

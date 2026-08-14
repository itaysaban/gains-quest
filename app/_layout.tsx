import 'react-native-gesture-handler';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { queryClient, persistOptions } from '@/lib/queryClient';
import { registerMutationDefaults } from '@/lib/registerMutationDefaults';
import { useStaleSessionPrompt } from '@/hooks/useStaleSessionPrompt';
import { LoadingState } from '@/components/ui/LoadingState';
import { useTheme } from '@/lib/theme';

// Runs once at module load — before the persisted cache below ever restores — so every resumable
// mutation has a registered mutationFn by the time resumePausedMutations() needs one.
registerMutationDefaults();

function RootNavigation() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const theme = useTheme();
  useStaleSessionPrompt({ checkOnAppForeground: true });

  useEffect(() => {
    if (isLoading) return;
    if ((segments as string[]).length === 0) return; // still on the root "/" index route — its own <Redirect> owns this transition

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/home');
    }
  }, [session, isLoading, segments, router]);

  if (isLoading) return <LoadingState />;

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="session/active" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="session/summary" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    // Every screen's <Screen> wrapper relies on SafeAreaView for its top/left/right insets — without
    // an explicit provider here, that falls back to React Navigation's per-navigator auto-injected
    // SafeAreaProviderCompat, which seeds from static initialMetrics rather than a live native
    // measurement. That's unreliable specifically for fullScreenModal screens (session/active,
    // session/summary): a true full-screen presentation extends behind the status bar/Dynamic Island,
    // so it needs a fresh, correct inset — a stale one is exactly what made the active session's
    // close button render too close to the top on notch/Dynamic-Island devices.
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={persistOptions}
          onSuccess={() => {
            // Cache has finished restoring from AsyncStorage — any set logged (or exercise added) right
            // before the app was killed is now sitting paused in the mutation cache; resume it.
            queryClient.resumePausedMutations();
          }}
        >
          <AuthProvider>
            <RootNavigation />
          </AuthProvider>
        </PersistQueryClientProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}

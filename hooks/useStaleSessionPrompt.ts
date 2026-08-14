import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { useSessionStore } from '@/store/sessionStore';
import { useDiscardSession } from './useWorkoutSession';

const STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000;

/**
 * "Finish or discard?" prompt for a session left in_progress for 12+ hours (PRD 6.1.3). Checked from
 * two places: app/session/active.tsx on mount (user navigated straight back into the old session), and
 * app/_layout.tsx's RootNavigation on app-foreground (user reopened the app and would otherwise land on
 * Home without ever seeing the prompt, since they never navigate into session/active on their own).
 */
export function useStaleSessionPrompt(options?: { checkOnAppForeground?: boolean }) {
  const sessionId = useSessionStore((s) => s.sessionId);
  const startedAtMs = useSessionStore((s) => s.startedAtMs);
  const router = useRouter();
  const discardSession = useDiscardSession();
  const isPromptingRef = useRef(false);

  function checkAndPrompt() {
    if (!sessionId || !startedAtMs || isPromptingRef.current) return;
    if (Date.now() - startedAtMs < STALE_THRESHOLD_MS) return;

    isPromptingRef.current = true;
    Alert.alert(
      'Unfinished workout',
      "You've had a workout in progress for over 12 hours. Finish it up or discard it?",
      [
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            discardSession.mutate(sessionId);
            isPromptingRef.current = false;
          },
        },
        {
          text: 'Review & Finish',
          onPress: () => {
            router.push('/session/active');
            isPromptingRef.current = false;
          },
        },
      ],
      { cancelable: false },
    );
  }

  useEffect(() => {
    checkAndPrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, startedAtMs]);

  useEffect(() => {
    if (!options?.checkOnAppForeground) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkAndPrompt();
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.checkOnAppForeground, sessionId, startedAtMs]);
}

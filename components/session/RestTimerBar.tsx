import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { useSessionStore } from '@/store/sessionStore';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';

export function RestTimerBar() {
  const restTimer = useSessionStore((s) => s.restTimer);
  const stopRestTimer = useSessionStore((s) => s.stopRestTimer);
  const adjustRestTimer = useSessionStore((s) => s.adjustRestTimer);
  const theme = useTheme();
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!restTimer.isRunning) return;
    const interval = setInterval(() => forceTick((n) => n + 1), 250);
    return () => clearInterval(interval);
  }, [restTimer.isRunning]);

  useEffect(() => {
    if (!restTimer.isRunning || !restTimer.endsAtMs) return;
    if (Date.now() >= restTimer.endsAtMs) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Notifications.scheduleNotificationAsync({
        content: { title: 'Rest complete', body: 'Time for your next set.' },
        trigger: null,
      }).catch(() => {});
      stopRestTimer();
    }
  }, [restTimer, stopRestTimer]);

  if (!restTimer.isRunning || !restTimer.endsAtMs) return null;

  const remainingMs = Math.max(0, restTimer.endsAtMs - Date.now());
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const ratio = restTimer.totalSeconds > 0 ? remainingMs / 1000 / restTimer.totalSeconds : 0;

  return (
    <View
      style={{
        backgroundColor: theme.cardInset,
        borderRadius: radius.lg,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <Text font="body" weight="600" size={12} color="secondary">
        Rest
      </Text>
      <View style={{ flex: 1, height: 6, borderRadius: radius.full, backgroundColor: theme.borderSubtle, overflow: 'hidden' }}>
        <View
          style={{
            height: '100%',
            width: `${Math.max(2, ratio * 100)}%`,
            backgroundColor: theme.primary,
            borderRadius: radius.full,
          }}
        />
      </View>
      <Text font="mono" weight="700" size={14} style={{ color: theme.gradientFrom }}>
        {formatMmSs(remainingSeconds)}
      </Text>
      <Pressable onPress={() => adjustRestTimer(-15)} hitSlop={8}>
        <Text font="body" weight="600" size={12} color="secondary">
          -15s
        </Text>
      </Pressable>
      <Pressable onPress={() => adjustRestTimer(15)} hitSlop={8}>
        <Text font="body" weight="600" size={12} color="secondary">
          +15s
        </Text>
      </Pressable>
      <Pressable onPress={stopRestTimer} hitSlop={8}>
        <Text font="body" weight="600" size={12} color="secondary">
          Skip
        </Text>
      </Pressable>
    </View>
  );
}

function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

import { useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { useStreak, useEnablePauseMode, useCancelPauseMode, usePauseDaysUsedThisQuarter } from '@/hooks/useGamification';
import { useTheme, spacing, radius } from '@/lib/theme';
import { trainingLocalDate, formatShortDate } from '@/lib/utils/date';

const MAX_PAUSE_DAYS = 14;

export default function PauseModeSettings() {
  const theme = useTheme();
  const { data: streak, isLoading: streakLoading, error: streakError, refetch: refetchStreak } = useStreak();
  const {
    data: usedThisQuarter,
    isLoading: usedLoading,
    error: usedError,
    refetch: refetchUsed,
  } = usePauseDaysUsedThisQuarter();
  const enablePause = useEnablePauseMode();
  const cancelPause = useCancelPauseMode();
  const [days, setDays] = useState(7);

  const error = streakError ?? usedError;
  if (error) {
    return (
      <Screen scroll>
        <View style={{ gap: spacing.md, alignItems: 'flex-start' }}>
          <Text weight="700">Couldn't load Pause Mode</Text>
          <Text color="muted">{(error as any)?.message ?? 'Something went wrong.'}</Text>
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => {
              refetchStreak();
              refetchUsed();
            }}
          />
        </View>
      </Screen>
    );
  }

  if (streakLoading || usedLoading || !streak || usedThisQuarter === undefined) return <LoadingState />;

  const today = trainingLocalDate();
  const remaining = Math.max(0, MAX_PAUSE_DAYS - usedThisQuarter);
  const isPaused = !!streak.paused_until && streak.paused_until >= today;

  async function handleEnable() {
    try {
      const result = await enablePause.mutateAsync(days);
      Alert.alert('Pause Mode enabled', `Paused for ${result.days_granted} day${result.days_granted === 1 ? '' : 's'}, through ${formatShortDate(result.paused_until)}.`);
    } catch (e: any) {
      Alert.alert('Could not enable Pause Mode', e?.message ?? 'Something went wrong.');
    }
  }

  function handleCancel() {
    Alert.alert('End Pause Mode?', 'Your streak will start counting again immediately. Only days you actually rested (no workout logged) count toward this quarter’s budget — days you trained through, or hadn’t reached yet, are never charged.', [
      { text: 'Keep Paused', style: 'cancel' },
      {
        text: 'End Pause Mode',
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await cancelPause.mutateAsync();
            const message =
              result.days_used === 0
                ? "None of your requested days were used — nothing was deducted from this quarter's budget."
                : `${result.days_used} day${result.days_used === 1 ? '' : 's'} counted toward this quarter's budget.`;
            Alert.alert('Pause Mode ended', message);
          } catch (e: any) {
            Alert.alert('Could not end Pause Mode', e?.message ?? 'Something went wrong.');
          }
        },
      },
    ]);
  }

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <Text color="muted">
          Dealing with injury, illness, or travel? Pause Mode holds your streak exactly where it is — it won't grow
          or break — for up to {MAX_PAUSE_DAYS} days each quarter.
        </Text>

        {isPaused ? (
          <View style={{ gap: spacing.md }}>
            <View style={{ backgroundColor: theme.primaryMuted, borderRadius: radius.lg, padding: spacing.md, gap: 4 }}>
              <Text weight="700" color="primary">
                Paused through {formatShortDate(streak.paused_until!)}
              </Text>
              <Text variant="caption" color="muted">
                Your streak is on hold until then.
              </Text>
            </View>
            <Button label="End Pause Mode" variant="secondary" onPress={handleCancel} loading={cancelPause.isPending} />
          </View>
        ) : remaining === 0 ? (
          <Text color="muted">You've used all {MAX_PAUSE_DAYS} pause days for this quarter. More will be available next quarter.</Text>
        ) : (
          <View style={{ gap: spacing.lg }}>
            <View style={{ gap: spacing.sm }}>
              <Text weight="600">Pause for how many days? ({remaining} remaining this quarter)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {[3, 7, 14].map((n) => {
                  const active = days === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => setDays(n)}
                      style={{
                        paddingVertical: spacing.sm,
                        paddingHorizontal: spacing.md,
                        borderRadius: radius.full,
                        backgroundColor: active ? theme.primary : theme.surfaceAlt,
                      }}
                    >
                      <Text weight="700" style={{ color: active ? '#FFF' : theme.text }}>
                        {n}d
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Button label="Enable Pause Mode" onPress={handleEnable} loading={enablePause.isPending} />
          </View>
        )}
      </View>
    </Screen>
  );
}

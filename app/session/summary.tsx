import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View, Dimensions, Alert, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import ConfettiCannon from 'react-native-confetti-cannon';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useTheme, spacing, radius } from '@/lib/theme';
import { formatDuration, formatShortDate } from '@/lib/utils/date';
import { pointSourceLabel, streakMultiplier } from '@/lib/utils/points';
import { useSessionPointBreakdown, useTodayPointsEarned, useStreak } from '@/hooks/useGamification';
import { useWorkoutSession, useDeleteCompletedSession } from '@/hooks/useWorkoutSession';
import { useActiveChallenges } from '@/hooks/useChallenges';
import { ChallengeCard } from '@/components/social/ChallengesSection';

interface PrResult {
  exercise_id: string;
  exercise_name: string;
  record_type: string;
  value: number;
}

interface BadgeResult {
  code: string;
  name: string;
  icon: string;
  category: string;
}

const RECORD_TYPE_LABEL: Record<string, string> = {
  max_weight: 'Max Weight',
  max_reps_at_weight: 'Best Reps',
  est_1rm: 'Est. 1RM',
  session_volume: 'Session Volume',
};

export default function SessionSummary() {
  const params = useLocalSearchParams<{
    sessionId: string;
    durationSeconds: string;
    totalVolume: string;
    totalSets: string;
    pointsEarned: string;
    prs: string;
    newBadges: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const shotRef = useRef<ComponentRef<typeof ViewShot>>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const { data: workoutSession } = useWorkoutSession(params.sessionId);
  const { data: breakdown } = useSessionPointBreakdown(params.sessionId);
  const { data: todayEarned } = useTodayPointsEarned();
  const { data: streak } = useStreak();
  const { data: challenges } = useActiveChallenges();
  const deleteSession = useDeleteCompletedSession();

  const prs: PrResult[] = params.prs ? JSON.parse(params.prs) : [];
  const newBadges: BadgeResult[] = params.newBadges ? JSON.parse(params.newBadges) : [];
  const hasCelebration = prs.length > 0 || newBadges.length > 0;
  const pointsEarned = Number(params.pointsEarned ?? 0);
  const multiplier = streak ? streakMultiplier(streak.current_streak_days) : 1.0;

  useEffect(() => {
    if (hasCelebration) setShowConfetti(true);
  }, [hasCelebration]);

  async function handleShare() {
    try {
      const uri = await shotRef.current?.capture?.();
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri);
      }
    } catch {
      // sharing is best-effort; silently ignore failures (e.g. simulator without share sheet)
    }
  }

  function handleDiscard() {
    Alert.alert(
      'Discard this session?',
      'This removes it and reverses any GainPoints it earned. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            setDiscarding(true);
            try {
              await deleteSession.mutateAsync(params.sessionId);
              router.dismissTo('/(tabs)/home');
            } finally {
              setDiscarding(false);
            }
          },
        },
      ],
    );
  }

  return (
    // fullScreenModal screens get their own native view-controller hierarchy on iOS that doesn't
    // reliably inherit safe-area measurements from the root SafeAreaProvider (app/_layout.tsx) — a
    // documented react-native-screens/expo-router gap. Same fix as session/active.tsx.
    <SafeAreaProvider>
    <Screen scroll padded={false}>
      <ViewShot ref={shotRef} options={{ format: 'png', quality: 0.9 }}>
        <LinearGradient
          colors={[theme.gradientFrom, theme.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.3, y: 1 }}
          style={{ paddingTop: 60, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: 6 }}
        >
          <Text font="mono" size={11} style={{ letterSpacing: 2, color: 'rgba(24,13,2,0.6)' }}>
            SESSION COMPLETE · {formatShortDate(workoutSession?.ended_at ?? workoutSession?.started_at ?? new Date().toISOString())}
          </Text>
          <Text font="display" size={40} style={{ color: theme.onAccent, lineHeight: 40 }}>
            {workoutSession?.name ?? 'Workout'}
          </Text>
          <Text font="body" weight="600" size={14} style={{ color: 'rgba(24,13,2,0.75)' }}>
            {formatDuration(Number(params.durationSeconds ?? 0))} · {params.totalSets ?? 0} sets ·{' '}
            {Math.round(Number(params.totalVolume ?? 0))}kg
          </Text>
        </LinearGradient>

        <View style={{ padding: spacing.lg, gap: spacing.md, backgroundColor: theme.background }}>
          <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text font="mono" size={12} color="muted" style={{ letterSpacing: 2 }}>
                GAINPOINTS
              </Text>
              <Text font="display" size={34} style={{ color: theme.gradientFrom, marginLeft: 'auto' }}>
                +{pointsEarned}
              </Text>
            </View>

            {breakdown?.map((row) => (
              <View key={row.source} style={{ flexDirection: 'row' }}>
                <Text font="body" weight="500" size={13} color="secondary" style={{ flex: 1 }}>
                  {pointSourceLabel(row.source)}
                  {row.source === 'volume' ? ` · ${Math.round(Number(params.totalVolume ?? 0))}kg` : ''}
                </Text>
                <Text font="body" weight="700" size={13}>
                  {row.points}
                </Text>
              </View>
            ))}

            <View style={{ height: 1, backgroundColor: theme.hairline, marginVertical: 2 }} />

            <View style={{ flexDirection: 'row' }}>
              <Text font="body" weight="600" size={13} style={{ flex: 1, color: theme.gradientFrom }}>
                Streak multiplier · {streak?.current_streak_days ?? 0} days
              </Text>
              <Text font="body" weight="600" size={13} style={{ color: theme.gradientFrom }}>
                × {multiplier.toFixed(2).replace(/\.?0+$/, '') || '1'}
              </Text>
            </View>
            <Text font="body" size={11} color="faint">
              Daily ceiling 400 GP · {todayEarned ?? pointsEarned} of 400 used today
            </Text>
          </View>

          {prs.length > 0 ? (
            <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm }}>
              <Text font="mono" size={12} color="muted" style={{ letterSpacing: 2 }}>
                RECORDS
              </Text>
              {prs.map((pr, idx) => (
                <View
                  key={idx}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.sm,
                    backgroundColor: '#3A2410',
                    borderWidth: 1,
                    borderColor: '#5C4416',
                    borderRadius: radius.md,
                    padding: spacing.md,
                  }}
                >
                  <Text style={{ fontSize: 17 }}>🏆</Text>
                  <View>
                    <Text font="body" weight="700" size={14}>
                      {pr.exercise_name}
                    </Text>
                    <Text font="body" size={11} color="secondary">
                      {RECORD_TYPE_LABEL[pr.record_type] ?? pr.record_type}: {Math.round(pr.value * 10) / 10}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {newBadges.length > 0 ? (
            <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm }}>
              <Text font="mono" size={12} color="muted" style={{ letterSpacing: 2 }}>
                BADGES UNLOCKED
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {newBadges.map((badge) => (
                  <View
                    key={badge.code}
                    style={{
                      alignItems: 'center',
                      gap: spacing.xs,
                      backgroundColor: theme.cardInset,
                      padding: spacing.md,
                      borderRadius: radius.md,
                      width: 100,
                    }}
                  >
                    {/* badge.icon is the PRD's "Emoji Banner" (e.g. 🎯) — rendered directly, same fix
                        as AchievementList.tsx; this screen has its own separate badge rendering. */}
                    <Text style={{ fontSize: 28 }}>{badge.icon}</Text>
                    <Text font="body" size={11} style={{ textAlign: 'center' }}>
                      {badge.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {challenges && challenges.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text font="mono" size={12} color="muted" style={{ letterSpacing: 2, paddingHorizontal: 2 }}>
                QUEST PROGRESS
              </Text>
              {challenges.map((challenge) => (
                <ChallengeCard key={challenge.id} challenge={challenge} />
              ))}
            </View>
          ) : null}

          {hasCelebration ? <Button label="Share screenshot" variant="secondary" onPress={handleShare} fullWidth /> : null}
        </View>
      </ViewShot>

      <View style={{ backgroundColor: theme.chrome, padding: spacing.lg, paddingBottom: spacing.xl, flexDirection: 'row', gap: spacing.sm }}>
        <Pressable
          onPress={handleDiscard}
          disabled={discarding}
          style={{
            flex: 1,
            backgroundColor: theme.background,
            borderRadius: radius.md,
            paddingVertical: spacing.md,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: discarding ? 0.6 : 1,
          }}
        >
          {discarding ? <ActivityIndicator color={theme.textSecondary} /> : (
            <Text font="body" weight="700" size={14} color="secondary">
              Discard
            </Text>
          )}
        </Pressable>
        <Pressable onPress={() => router.dismissTo('/(tabs)/home')} style={{ flex: 2 }}>
          <LinearGradient
            colors={[theme.gradientFrom, theme.gradientTo]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text font="body" weight="700" size={15} style={{ color: theme.onAccent }}>
              Save session
            </Text>
          </LinearGradient>
        </Pressable>
      </View>
    </Screen>

    {/* Rendered outside Screen's ScrollView and as the last sibling here, with an explicit zIndex, so
        it paints on top of the (opaque-background) content instead of underneath it — it was
        previously a first-child sibling inside the ScrollView's content flow, where the content
        View's opaque background covered it. pointerEvents="none" lets taps reach the buttons below. */}
    {showConfetti ? (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, elevation: 999 }} pointerEvents="none">
        <ConfettiCannon
          count={120}
          origin={{ x: Dimensions.get('window').width / 2, y: 0 }}
          colors={[theme.primary, theme.gradientFrom, theme.gradientTo, theme.warning, '#FFFFFF']}
          fadeOut
          onAnimationEnd={() => setShowConfetti(false)}
        />
      </View>
    ) : null}
    </SafeAreaProvider>
  );
}

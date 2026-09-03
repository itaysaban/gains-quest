import { useEffect, useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/ui/Text';
import { LoadingState } from '@/components/ui/LoadingState';
import { useActiveChallenges, useClaimChallenge, useResetChallenges } from '@/hooks/useChallenges';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { Challenge } from '@/types/domain';

// The design's "ready to claim" background (#2A1F0D) has no existing named theme token — a one-off
// literal, same as the leaderboard's own is_self row highlight (#3A2410) already does for a
// similarly one-off treatment.
const READY_TO_CLAIM_BG = '#2A1F0D';

// How long the progress bar takes to fill. The marker's pop/colour change is delayed by exactly this
// long so it lands as the bar reaches the end, not while it's still travelling.
const BAR_FILL_MS = 800;

/** Countdown to the next server-clock UTC midnight — matching what fn_active_challenges actually
 * resets against (current_date, not a per-user-local-timezone boundary; same documented
 * simplification the period boundary itself already carries). */
function useResetCountdown(): string {
  const [label, setLabel] = useState('');
  useEffect(() => {
    function tick() {
      const now = new Date();
      const nextUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      const diffMs = Math.max(0, nextUtcMidnight - now.getTime());
      const h = Math.floor(diffMs / 3_600_000);
      const m = Math.floor((diffMs % 3_600_000) / 60_000);
      setLabel(`${h}:${String(m).padStart(2, '0')}`);
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return label;
}

/** M4 Story 4 (Daily Quests, redesigned 2026-09-01) — a fixed daily pool (PRD §6.6, F6/P2), not
 * personalized. Lives inside Add Workout per the confirmed navigation decision (a section here, not
 * a 5th tab). */
export function ChallengesSection() {
  const theme = useTheme();
  const { data: challenges, isLoading } = useActiveChallenges();
  const resetLabel = useResetCountdown();
  const resetChallenges = useResetChallenges();

  if (isLoading) return <LoadingState />;
  if (!challenges || challenges.length === 0) return null;

  const allCleared = challenges.every((c) => c.status === 'completed');
  const totalPoints = challenges.reduce((sum, c) => sum + c.points, 0);

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text font="mono" size={13} color="muted" style={{ letterSpacing: 1.5 }}>
          DAILY QUESTS
        </Text>
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {__DEV__ ? (
            <Pressable
              onPress={() =>
                resetChallenges.mutate(undefined, {
                  onSuccess: () => Alert.alert('Quests reset', "Today's quests were cleared — pull to refresh or reopen the screen."),
                  onError: (e) => Alert.alert('Reset failed', e.message),
                })
              }
              disabled={resetChallenges.isPending}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{
                backgroundColor: theme.primary,
                borderRadius: radius.sm,
                paddingHorizontal: 8,
                paddingVertical: 4,
                opacity: resetChallenges.isPending ? 0.5 : 1,
              }}
            >
              <Text font="mono" size={11} weight="700" style={{ color: theme.onAccent }}>
                RESET (DEV)
              </Text>
            </Pressable>
          ) : null}
          <Text font="mono" size={11} weight="600" style={{ color: theme.gradientFrom }}>
            RESETS {resetLabel}
          </Text>
        </View>
      </View>
      {allCleared ? (
        <AllClearedBanner totalPoints={totalPoints} resetLabel={resetLabel} />
      ) : (
        challenges.map((challenge) => <QuestCard key={challenge.id} challenge={challenge} />)
      )}
    </View>
  );
}

/** Exported so Session Summary can reuse the same card, rather than duplicating the quest visual,
 * inside its own dedicated post-workout Quest Progress screen. Second design handoff (2026-09-01)
 * simplified this from an angular clip-path tile to a plain rounded-square one — no SVG needed. */
export function QuestCard({ challenge, animate = true }: { challenge: Challenge; animate?: boolean }) {
  const theme = useTheme();
  const claimChallenge = useClaimChallenge();

  const readyToClaim = challenge.status === 'ready_to_claim';
  const claimed = challenge.status === 'completed';
  const fraction = Math.min(1, challenge.progress_value / challenge.target_value);
  const markerColor = claimed ? theme.success : theme.primary;
  const counterColor = claimed ? theme.success : readyToClaim ? theme.gradientFrom : theme.textMuted;

  // Progress bar eases to its new width instead of snapping — starts at 0 rather than `fraction` so
  // it visibly fills in on mount too, not just when an already-mounted instance's fraction changes.
  // That matters because both places this renders (Quest Progress, Add Workout) mount the card fresh
  // on every visit rather than keeping one instance alive across a session completing — without this,
  // there'd be nothing to interpolate from and the bar would just appear at its final width.
  // `animate={false}` renders the finished state outright, no fill and no celebration — used by Quest
  // Progress for quests this session didn't actually advance, so only the bars that really moved draw
  // attention.
  const progress = useSharedValue(animate ? 0 : fraction);
  useEffect(() => {
    progress.value = animate ? withTiming(fraction, { duration: BAR_FILL_MS }) : fraction;
  }, [fraction, progress, animate]);
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  // The card frame is what reacts when the bar tops out: it jumps, and its border/background go from
  // the resting dark treatment to the orange ready-to-claim one. Delayed by the bar's own fill
  // duration so the sequence reads as "bar fills -> hits the end -> frame jumps and lights up"
  // instead of the card already sitting there orange before the bar has got anywhere. Only
  // ready-to-claim highlights: an already-claimed card stays in its dimmed, borderless resting state.
  const completion = useSharedValue(!animate && readyToClaim ? 1 : 0);
  const jump = useSharedValue(1);
  useEffect(() => {
    if (readyToClaim) {
      completion.value = animate ? withDelay(BAR_FILL_MS, withTiming(1, { duration: 200 })) : 1;
      if (animate) {
        jump.value = withDelay(BAR_FILL_MS, withSequence(withTiming(1.04, { duration: 150 }), withTiming(1, { duration: 200 })));
      }
    } else {
      completion.value = withTiming(0, { duration: 150 });
      jump.value = withTiming(1, { duration: 150 });
    }
  }, [readyToClaim, completion, jump, animate]);
  const cardStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(completion.value, [0, 1], [theme.background, READY_TO_CLAIM_BG]),
    borderColor: interpolateColor(completion.value, [0, 1], [theme.border, theme.primary]),
    transform: [{ scale: jump.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          borderRadius: radius.lg,
          borderWidth: claimed ? 0 : 1,
          padding: spacing.md,
          opacity: claimed ? 0.55 : 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
        },
        cardStyle,
      ]}
    >
      <Text style={{ width: 30, textAlign: 'center', fontSize: 34, fontWeight: '800', color: markerColor, lineHeight: 34 }}>!</Text>
      <View style={{ flex: 1, gap: 7 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text
            font="body"
            weight="700"
            size={14}
            style={{ flex: 1, textDecorationLine: claimed ? 'line-through' : 'none' }}
          >
            {challenge.name}
          </Text>
          {readyToClaim ? (
            <Pressable
              onPress={() => claimChallenge.mutate(challenge.id)}
              disabled={claimChallenge.isPending}
              style={{ backgroundColor: theme.primary, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.sm, opacity: claimChallenge.isPending ? 0.6 : 1 }}
            >
              <Text font="body" weight="700" size={11} style={{ color: theme.onAccent }}>
                CLAIM {challenge.points} GP
              </Text>
            </Pressable>
          ) : (
            <Text font="mono" size={12} weight="700" style={{ color: counterColor }}>
              {claimed ? `+${challenge.points} GP` : `${challenge.points} GP`}
            </Text>
          )}
        </View>
        <View style={{ height: 8, borderRadius: radius.sm, backgroundColor: theme.cardInset, overflow: 'hidden' }}>
          <Animated.View style={[{ height: '100%', backgroundColor: claimed ? theme.success : theme.primary }, barStyle]} />
        </View>
        <Text font="mono" size={11} style={{ color: counterColor }}>
          {claimed ? 'CLAIMED' : readyToClaim ? `${challenge.progress_value} / ${challenge.target_value} COMPLETE` : `${challenge.progress_value} / ${challenge.target_value}`}
        </Text>
      </View>
    </Animated.View>
  );
}

function AllClearedBanner({ totalPoints, resetLabel }: { totalPoints: number; resetLabel: string }) {
  const theme = useTheme();

  return (
    <LinearGradient
      colors={[theme.gradientFrom, theme.gradientTo]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: radius.xl, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
    >
      <Text style={{ width: 34, textAlign: 'center', fontSize: 40, fontWeight: '800', color: theme.onAccent, lineHeight: 40 }}>!</Text>
      <View style={{ gap: 4 }}>
        <Text font="display" size={20} style={{ color: theme.onAccent }}>
          All quests cleared
        </Text>
        <Text font="body" weight="500" size={12} style={{ color: 'rgba(24,13,2,0.72)' }}>
          +{totalPoints} GP today · new quests in {resetLabel}
        </Text>
      </View>
    </LinearGradient>
  );
}

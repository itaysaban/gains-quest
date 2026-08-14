import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ConfettiCannon from 'react-native-confetti-cannon';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useTheme, spacing, radius } from '@/lib/theme';
import { formatDuration } from '@/lib/utils/date';

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
    durationSeconds: string;
    totalVolume: string;
    totalSets: string;
    xpEarned: string;
    leveledUp: string;
    newLevel: string;
    prs: string;
    newBadges: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const shotRef = useRef<ComponentRef<typeof ViewShot>>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  const prs: PrResult[] = params.prs ? JSON.parse(params.prs) : [];
  const newBadges: BadgeResult[] = params.newBadges ? JSON.parse(params.newBadges) : [];
  const leveledUp = params.leveledUp === 'true';
  const hasCelebration = prs.length > 0 || newBadges.length > 0 || leveledUp;

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

  return (
    <Screen scroll>
      {showConfetti ? (
        <ConfettiCannon
          count={120}
          origin={{ x: Dimensions.get('window').width / 2, y: 0 }}
          colors={[theme.primary, theme.gradientFrom, theme.gradientTo, theme.warning, '#FFFFFF']}
          fadeOut
          onAnimationEnd={() => setShowConfetti(false)}
        />
      ) : null}

      <ViewShot ref={shotRef} options={{ format: 'png', quality: 0.9 }}>
        <View style={{ gap: spacing.lg, backgroundColor: theme.background, padding: spacing.sm }}>
          <View style={{ alignItems: 'center', gap: spacing.xs, marginTop: spacing.xl }}>
            <Ionicons name="checkmark-circle" size={56} color={theme.success} />
            <Text variant="title">Workout Complete</Text>
          </View>

          <Card style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            <Stat label="Duration" value={formatDuration(Number(params.durationSeconds ?? 0))} />
            <Stat label="Volume" value={`${Math.round(Number(params.totalVolume ?? 0))}kg`} />
            <Stat label="Sets" value={String(params.totalSets ?? 0)} />
          </Card>

          <Card style={{ alignItems: 'center', gap: spacing.xs, backgroundColor: theme.primaryMuted, borderColor: theme.primary }}>
            <Text variant="label" color="primary" weight="700">
              XP EARNED
            </Text>
            <Text variant="title" color="primary">
              +{params.xpEarned ?? 0}
            </Text>
            {leveledUp ? (
              <Text weight="700" color="primary">
                🎉 Level Up! You're now level {params.newLevel}
              </Text>
            ) : null}
          </Card>

          {prs.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text variant="subtitle">New Personal Records</Text>
              {prs.map((pr, idx) => (
                <Card key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Ionicons name="trophy" size={22} color={theme.warning} />
                  <View>
                    <Text weight="600">{pr.exercise_name}</Text>
                    <Text variant="caption" color="muted">
                      {RECORD_TYPE_LABEL[pr.record_type] ?? pr.record_type}: {Math.round(pr.value * 10) / 10}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
          ) : null}

          {newBadges.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text variant="subtitle">Badges Unlocked</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {newBadges.map((badge) => (
                  <View
                    key={badge.code}
                    style={{
                      alignItems: 'center',
                      gap: spacing.xs,
                      backgroundColor: theme.surfaceAlt,
                      padding: spacing.md,
                      borderRadius: radius.md,
                      width: 100,
                    }}
                  >
                    <Ionicons name={(badge.icon as any) ?? 'medal'} size={28} color={theme.primary} />
                    <Text variant="caption" style={{ textAlign: 'center' }}>
                      {badge.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ViewShot>

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        {hasCelebration ? <Button label="Share" variant="secondary" onPress={handleShare} fullWidth /> : null}
        <Button label="Done" onPress={() => router.dismissTo('/(tabs)/home')} fullWidth />
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text variant="title">{value}</Text>
      <Text variant="caption" color="muted">
        {label}
      </Text>
    </View>
  );
}

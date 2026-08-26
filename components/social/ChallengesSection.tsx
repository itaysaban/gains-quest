import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { LoadingState } from '@/components/ui/LoadingState';
import { useActiveChallenges } from '@/hooks/useChallenges';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { Challenge } from '@/types/domain';

/** M4 Story 4 — a fixed weekly pool (PRD F6, P2), not personalized. Lives inside Add Workout per
 * the confirmed navigation decision (a section here, not a 5th tab). */
export function ChallengesSection() {
  const { data: challenges, isLoading } = useActiveChallenges();

  if (isLoading) return <LoadingState />;
  if (!challenges || challenges.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      {challenges.map((challenge) => (
        <ChallengeCard key={challenge.id} challenge={challenge} />
      ))}
    </View>
  );
}

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const theme = useTheme();
  const completed = challenge.status === 'completed';
  const fraction = Math.min(1, challenge.progress_value / challenge.target_value);

  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderRadius: radius.md,
        padding: spacing.md,
        gap: spacing.xs,
        opacity: completed ? 0.7 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text font="body" weight="700" size={15}>
          {challenge.name}
        </Text>
        {completed ? (
          <Text style={{ fontSize: 15 }}>✅</Text>
        ) : (
          <Text font="mono" size={12} style={{ color: theme.gradientFrom }}>
            +{challenge.points} GP
          </Text>
        )}
      </View>
      <Text font="body" size={13} color="secondary">
        {challenge.description}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flex: 1, height: 6, borderRadius: radius.full, backgroundColor: theme.cardInset, overflow: 'hidden' }}>
          <View
            style={{
              width: `${fraction * 100}%`,
              height: '100%',
              borderRadius: radius.full,
              backgroundColor: completed ? theme.success : theme.primary,
            }}
          />
        </View>
        <Text font="mono" size={12} color="muted">
          {challenge.progress_value}/{challenge.target_value}
        </Text>
      </View>
    </View>
  );
}

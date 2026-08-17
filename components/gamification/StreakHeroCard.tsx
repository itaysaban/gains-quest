import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { restUsedThisWeek } from '@/lib/notifications/streakReminder';
import type { Streak } from '@/types/domain';

interface Props {
  streak: Streak;
  weeklyGoalDays: number;
  /** From usePauseDaysUsedThisQuarter() — used only when not currently paused, to decide whether the
   * "Pause" stat reads Available or Used up. */
  pauseDaysUsedThisQuarter: number;
}

const MAX_PAUSE_DAYS = 14;

/** Achievement Hall streak card — design handoff §7 (design_handoff_gainquest/GainQuest Screens.html,
 * "Achievement Hall" screen). Flame tile + current/best streak, then three inset stats: rest
 * allowance remaining this week, freezes banked, and Pause Mode availability. */
export function StreakHeroCard({ streak, weeklyGoalDays, pauseDaysUsedThisQuarter }: Props) {
  const theme = useTheme();

  const restAllowance = Math.max(0, 7 - weeklyGoalDays);
  const restUsed = restUsedThisWeek(streak);
  const restRemaining = Math.max(0, restAllowance - restUsed);

  const today = new Date().toISOString().slice(0, 10);
  const isPaused = !!streak.paused_until && streak.paused_until >= today;
  const pauseState = isPaused ? 'Paused' : pauseDaysUsedThisQuarter < MAX_PAUSE_DAYS ? 'Available' : 'Used up';
  const pauseColor = isPaused ? theme.primary : pauseState === 'Available' ? theme.success : theme.textMuted;

  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
        <LinearGradient
          colors={[theme.gradientFrom, theme.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: 54, height: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 24 }}>🔥</Text>
        </LinearGradient>

        <View style={{ flex: 1 }}>
          <Text font="display" size={40} style={{ lineHeight: 40 }}>
            {streak.current_streak_days}
          </Text>
          <Text font="body" weight="500" size={12} color="muted" style={{ marginTop: 4 }}>
            Day streak
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Text font="body" weight="500" size={11} color="muted">
            Personal best
          </Text>
          <Text font="display" size={24} style={{ color: theme.gradientFrom, lineHeight: 26 }}>
            {streak.longest_streak_days} days
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <StreakStat label="Rest left" value={`${restRemaining} of ${restAllowance}`} />
        <StreakStat label="Freezes" value={`${streak.freezes_banked} banked`} />
        <StreakStat label="Pause" value={pauseState} valueColor={pauseColor} />
      </View>
    </View>
  );
}

function StreakStat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.cardInset, borderRadius: radius.md, padding: spacing.sm, gap: 4 }}>
      <Text font="body" weight="600" size={11} color="muted">
        {label}
      </Text>
      <Text font="body" weight="700" size={16} style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </Text>
    </View>
  );
}

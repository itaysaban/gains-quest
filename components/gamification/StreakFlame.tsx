import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import type { Streak } from '@/types/domain';

export function StreakFlame({ streak, compact }: { streak: Streak; compact?: boolean }) {
  const theme = useTheme();
  const isActive = streak.current_streak_days > 0;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
      <Ionicons name="flame" size={compact ? 18 : 24} color={isActive ? theme.streak : theme.textMuted} />
      <Text weight="700" variant={compact ? 'body' : 'subtitle'}>
        {streak.current_streak_days} day{streak.current_streak_days === 1 ? '' : 's'}
      </Text>
      {!compact && streak.streak_freezes_available > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            marginLeft: spacing.xs,
            backgroundColor: theme.primaryMuted,
            paddingHorizontal: spacing.xs,
            paddingVertical: 2,
            borderRadius: 999,
          }}
        >
          <Ionicons name="shield-checkmark" size={12} color={theme.primary} />
          <Text variant="label" color="primary">
            {streak.streak_freezes_available} freeze
          </Text>
        </View>
      ) : null}
    </View>
  );
}

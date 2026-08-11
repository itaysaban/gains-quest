import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import type { Badge, UserBadge } from '@/types/domain';

export function BadgeGrid({ badges, userBadges }: { badges: Badge[]; userBadges: UserBadge[] }) {
  const theme = useTheme();
  const unlockedIds = new Set(userBadges.map((ub) => ub.badge_id));

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {badges.map((badge) => {
        const unlocked = unlockedIds.has(badge.id);
        return (
          <View
            key={badge.id}
            style={{
              width: 100,
              alignItems: 'center',
              gap: spacing.xs,
              backgroundColor: unlocked ? theme.primaryMuted : theme.surfaceAlt,
              padding: spacing.md,
              borderRadius: radius.md,
              opacity: unlocked ? 1 : 0.5,
            }}
          >
            <Ionicons name={(badge.icon as any) ?? 'medal'} size={26} color={unlocked ? theme.primary : theme.textMuted} />
            <Text variant="caption" weight="600" style={{ textAlign: 'center' }}>
              {badge.name}
            </Text>
            <Text variant="label" color="muted" style={{ textAlign: 'center' }}>
              {badge.category}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

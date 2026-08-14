import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import type { Badge, UserBadge } from '@/types/domain';

export function AchievementList({ badges, userBadges }: { badges: Badge[]; userBadges: UserBadge[] }) {
  const unlockedIds = new Set(userBadges.map((ub) => ub.badge_id));

  return (
    <View style={{ gap: spacing.sm }}>
      {badges.map((badge) => (
        <AchievementRow key={badge.id} badge={badge} unlocked={unlockedIds.has(badge.id)} />
      ))}
    </View>
  );
}

function AchievementRow({ badge, unlocked }: { badge: Badge; unlocked: boolean }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: theme.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: theme.border,
        padding: spacing.md,
        opacity: unlocked ? 1 : 0.7,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: unlocked ? theme.primaryMuted : theme.surfaceAlt,
        }}
      >
        <Ionicons name={(badge.icon as any) ?? 'medal'} size={22} color={unlocked ? theme.primary : theme.textMuted} />
      </View>

      <View style={{ flex: 1 }}>
        <Text weight="700">{badge.name}</Text>
        <Text variant="caption" color="muted">
          {badge.description}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
        <Text variant="caption" color="muted">
          {(badge.points ?? 0).toLocaleString()} pts
        </Text>
        <Ionicons
          name={unlocked ? 'checkmark-circle' : 'lock-closed'}
          size={18}
          color={unlocked ? theme.success : theme.locked}
        />
      </View>
    </View>
  );
}

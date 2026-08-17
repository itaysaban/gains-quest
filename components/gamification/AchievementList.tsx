import { View } from 'react-native';
import { useTheme, spacing, radius, type Theme } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import type { Badge, UserBadge } from '@/types/domain';
import type { BadgeCategory } from '@/types/database.types';

/** M3 Epic 3 Story 3.4: one accent color per badge category — kept for the icon tile's background
 * tint even though the design handoff itself doesn't vary tile color by category; it's a reasonable
 * addition that survives unlocked/locked and reads fine against the new palette. */
function categoryAccent(theme: Theme, category: BadgeCategory): string {
  const map: Record<BadgeCategory, string> = {
    onboarding: theme.badgeOnboarding,
    cardio: theme.badgeCardio,
    consistency: theme.badgeConsistency,
    volume: theme.badgeVolume,
    social: theme.badgeSocial,
    progression: theme.badgeProgression,
    variety: theme.badgeVariety,
  };
  return map[category];
}

/** Locked badges whose criteria has a natural "current / target" reading show it appended to the
 * requirement text, e.g. "Log 100 sessions · 84 / 100" — design handoff §7. `progress` is null for
 * criteria types with no such reading (see fn_badge_progress); those badges just show the plain
 * requirement text. */
function progressSuffix(badge: Badge, currentValue: number | null | undefined): string {
  if (currentValue == null) return '';
  const criteria = badge.criteria as { value?: number } | null;
  const target = criteria?.value;
  if (typeof target !== 'number') return '';
  return ` · ${Math.floor(currentValue).toLocaleString()} / ${target.toLocaleString()}`;
}

interface Props {
  badges: Badge[];
  userBadges: UserBadge[];
  /** badge_id -> current progress value, from useBadgeProgress(). Only covers locked badges. */
  progress: Record<string, number | null>;
}

export function AchievementList({ badges, userBadges, progress }: Props) {
  const unlockedIds = new Set(userBadges.map((ub) => ub.badge_id));

  return (
    <View style={{ gap: 9 }}>
      {badges.map((badge) => (
        <AchievementRow key={badge.id} badge={badge} unlocked={unlockedIds.has(badge.id)} currentValue={progress[badge.id]} />
      ))}
    </View>
  );
}

function AchievementRow({ badge, unlocked, currentValue }: { badge: Badge; unlocked: boolean; currentValue: number | null | undefined }) {
  const theme = useTheme();
  const accent = categoryAccent(theme, badge.category);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: theme.surface,
        borderRadius: radius.md,
        padding: 13,
        opacity: unlocked ? 1 : 0.62,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.cardInset,
        }}
      >
        {/* badge.icon is the PRD's "Emoji Banner" (e.g. 🎯) — rendered directly, not looked up as a
            vector icon name. */}
        <Text style={{ fontSize: 18 }}>{badge.icon}</Text>
      </View>

      <View style={{ flex: 1 }}>
        <Text font="body" weight="700" size={15} style={{ lineHeight: 17 }}>
          {badge.name}
        </Text>
        <Text font="body" weight="400" size={11} color="muted" style={{ lineHeight: 14, marginTop: 1 }}>
          {badge.description}
          {unlocked ? '' : progressSuffix(badge, currentValue)}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text font="display" size={15} style={{ color: theme.gradientFrom }}>
          {(badge.points ?? 0).toLocaleString()}
        </Text>
        <Text font="body" weight="400" size={10} color="muted">
          pts
        </Text>
      </View>

      <Text style={{ fontSize: unlocked ? 14 : 13, color: unlocked ? theme.success : theme.textMuted, marginLeft: spacing.xs }}>
        {unlocked ? '✓' : '🔒'}
      </Text>
    </View>
  );
}

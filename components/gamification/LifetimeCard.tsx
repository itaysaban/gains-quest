import { View } from 'react-native';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import type { LifetimeStats } from '@/hooks/useGamification';

/** Achievement Hall LIFETIME card — design handoff §7. Season rank is an M4 dependency (seasonal
 * leaderboards don't exist yet) and always renders as a placeholder, never a fake number. */
export function LifetimeCard({ stats }: { stats: LifetimeStats }) {
  const theme = useTheme();

  const items: { label: string; value: string }[] = [
    { label: 'Total GP', value: stats.total_gp.toLocaleString() },
    { label: 'Sessions', value: stats.sessions.toLocaleString() },
    { label: 'Volume', value: formatVolume(stats.volume_kg) },
    { label: 'PRs set', value: stats.prs.toLocaleString() },
    { label: 'Season rank', value: '—' },
    { label: 'Badges', value: `${stats.badges_unlocked} / ${stats.badges_total}` },
  ];

  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md }}>
      <Text font="mono" size={12} color="muted" style={{ letterSpacing: 2.5 }}>
        LIFETIME
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, rowGap: spacing.md }}>
        {items.map((item) => (
          <View key={item.label} style={{ flexBasis: '28%', flexGrow: 1 }}>
            <Text font="display" size={22}>
              {item.value}
            </Text>
            <Text font="body" weight="500" size={11} color="muted" style={{ marginTop: 4 }}>
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** The design's own example shows "412 t" for a large lifetime total — tonnes once it's big enough
 * to matter, kg below that so small numbers don't read as a suspiciously precise decimal. */
function formatVolume(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} t`;
  return `${Math.round(kg).toLocaleString()} kg`;
}

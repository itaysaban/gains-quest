import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useLeaderboard } from '@/hooks/useGamification';
import { useFriends } from '@/hooks/useFriends';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { LeaderboardRow } from '@/types/domain';

type Scope = 'global' | 'friends';

/** Leaderboard — M4 Story 2, PRD §6.2, MVP scope. Not built here: the podium graphic and "delta
 * since yesterday" from the design handoff (no historical rank snapshots exist to compute a delta
 * from), and promotion/relegation (nothing processes season rollover yet, so showing "promotion top
 * 20" would imply a mechanic that doesn't actually run) — a plain ranked list instead. */
export default function Leaderboard() {
  const theme = useTheme();
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('global');
  const { data: friends } = useFriends();
  const { data: rows, isLoading } = useLeaderboard(scope);

  const showFriendsEmptyState = scope === 'friends' && friends?.length === 0;
  const seasonLabel = new Date().toLocaleDateString(undefined, { month: 'long' }).toUpperCase();

  return (
    <Screen scroll>
      <View style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text font="display" size={34}>
            Leaderboard
          </Text>
          <Text font="mono" size={12} style={{ color: theme.gradientFrom, letterSpacing: 1.5 }}>
            {seasonLabel} SEASON
          </Text>
        </View>

        <View style={{ flexDirection: 'row', backgroundColor: theme.surface, borderRadius: radius.md, padding: 4 }}>
          <ScopeTab label="Global" active={scope === 'global'} onPress={() => setScope('global')} />
          <ScopeTab label="Friends" active={scope === 'friends'} onPress={() => setScope('friends')} />
        </View>

        {scope === 'global' && rows && rows.length > 0 ? (
          <Text font="body" size={13} color="muted">
            Tier {rows[0].tier_number} · {rows[0].tier_size} lifters
          </Text>
        ) : null}

        {isLoading ? (
          <LoadingState />
        ) : showFriendsEmptyState ? (
          <EmptyState
            icon="people-outline"
            title="No friends yet"
            message="Add friends to see how you stack up against them this season."
            actionLabel="Find Friends"
            onAction={() => router.push('/(tabs)/settings/friends')}
          />
        ) : !rows || rows.length === 0 ? (
          <EmptyState icon="trophy-outline" title="Nobody's on the board yet" message="Finish a workout to earn GainPoints and claim the top spot." />
        ) : (
          <View style={{ gap: spacing.xs }}>
            {rows.map((row) => (
              <LeaderboardRowItem key={row.user_id} row={row} />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

function ScopeTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        paddingVertical: spacing.sm,
        borderRadius: radius.sm,
        alignItems: 'center',
        backgroundColor: active ? theme.primary : 'transparent',
      }}
    >
      <Text font="body" weight="700" size={13} style={{ color: active ? theme.onAccent : theme.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );
}

function LeaderboardRowItem({ row }: { row: LeaderboardRow }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: row.is_self ? '#3A2410' : theme.surface,
        borderWidth: row.is_self ? 1 : 0,
        borderColor: theme.primary,
        borderRadius: radius.md,
        padding: spacing.md,
      }}
    >
      <Text font="mono" weight="600" size={13} color="muted" style={{ width: 28 }}>
        #{row.rank}
      </Text>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: radius.full,
          backgroundColor: theme.avatarPlaceholder,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text weight="700" size={13}>
          {(row.display_name ?? 'A').charAt(0).toUpperCase()}
        </Text>
      </View>
      <Text font="body" weight="600" size={15} style={{ flex: 1 }}>
        {row.display_name ?? 'Athlete'}
        {row.is_self ? ' (you)' : ''}
      </Text>
      <Text font="display" size={18} style={{ color: theme.gradientFrom }}>
        {row.season_gp.toLocaleString()}
      </Text>
    </View>
  );
}

import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useLeaderboard } from '@/hooks/useGamification';
import { useFriends } from '@/hooks/useFriends';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { LeaderboardRow } from '@/types/domain';

type Scope = 'global' | 'friends';

/** Leaderboard — M4 Story 2, PRD §6.2, MVP scope, podium added 2026-09-01 (third design handoff).
 * Still not built: the "▲ N since yesterday" delta on the pinned row (needs daily rank snapshots —
 * real new backend infra, not a visual fix) and promotion/relegation (nothing processes season
 * rollover yet, so showing "promotion top 20" would imply a mechanic that doesn't actually run). */
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
          <View style={{ gap: spacing.md }}>
            {rows.length >= 3 ? <Podium top3={rows.slice(0, 3)} /> : null}
            <View style={{ gap: spacing.xs }}>
              {(rows.length >= 3 ? rows.slice(3) : rows).map((row) => (
                <LeaderboardRowItem key={row.user_id} row={row} />
              ))}
            </View>
          </View>
        )}
      </View>
    </Screen>
  );
}

/** top3 must be exactly ranks 1, 2, 3 in that order (fn_leaderboard's own ordering). Rendered as
 * 2nd / 1st / 3rd left-to-right, matching the design's centre-raised layout. */
function Podium({ top3 }: { top3: LeaderboardRow[] }) {
  const [first, second, third] = top3;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
      <PodiumColumn row={second} place={2} plinthHeight={74} />
      <PodiumColumn row={first} place={1} plinthHeight={104} />
      <PodiumColumn row={third} place={3} plinthHeight={58} />
    </View>
  );
}

function PodiumColumn({ row, place, plinthHeight }: { row: LeaderboardRow; place: 1 | 2 | 3; plinthHeight: number }) {
  const theme = useTheme();
  const isFirst = place === 1;
  const avatarSize = isFirst ? 58 : 48;

  return (
    <View style={{ flex: isFirst ? 1.15 : 1, alignItems: 'center', gap: spacing.md }}>
      {isFirst ? <Text style={{ fontSize: 16 }}>👑</Text> : null}
      {isFirst ? (
        <LinearGradient
          colors={[theme.gradientFrom, theme.gradientTo]}
          style={{ width: avatarSize, height: avatarSize, borderRadius: radius.full, borderWidth: row.is_self ? 2 : 0, borderColor: theme.text }}
        />
      ) : (
        <View
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: radius.full,
            backgroundColor: theme.avatarPlaceholder,
            borderWidth: row.is_self ? 2 : 0,
            borderColor: theme.primary,
          }}
        />
      )}
      <Text font="body" weight="600" size={isFirst ? 14 : 13} numberOfLines={1}>
        {row.display_name ?? 'Athlete'}
        {row.is_self ? ' (you)' : ''}
      </Text>
      {/* Score — the element this podium is actually meant to draw the eye to, made deliberately
          larger/bolder than the original 11/13px treatment. */}
      <Text font="display" size={isFirst ? 24 : 20} style={{ color: theme.gradientFrom }}>
        {row.season_gp.toLocaleString()}
      </Text>
      {isFirst ? (
        <LinearGradient
          colors={[theme.gradientFrom, theme.gradientTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ width: '100%', height: plinthHeight, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text font="display" size={32} style={{ color: theme.onAccent }}>
            {place}
          </Text>
        </LinearGradient>
      ) : (
        <View
          style={{
            width: '100%',
            height: plinthHeight,
            backgroundColor: theme.surface,
            borderTopLeftRadius: radius.md,
            borderTopRightRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text font="display" size={26} style={{ color: '#C9C9E0' }}>
            {place}
          </Text>
        </View>
      )}
    </View>
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

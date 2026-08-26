import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFriendFeed, useToggleReaction } from '@/hooks/useFeed';
import { useFriends } from '@/hooks/useFriends';
import { formatDuration, formatRelative } from '@/lib/utils/date';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { FeedEvent } from '@/types/domain';

/** M4 Story 3 — self + accepted friends' activity, PRD §6.5. Deliberately activity-shape only:
 * fn_friend_feed's metadata never carries weight/volume numbers (privacy default), so cards show
 * duration/set counts and PR/badge *names*, never the underlying numbers. */
export function FeedList() {
  const router = useRouter();
  const { data: friends } = useFriends();
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useFriendFeed();
  const toggleReaction = useToggleReaction();

  const events = data?.pages.flat() ?? [];

  if (isLoading) return <LoadingState />;

  if (events.length === 0) {
    return friends && friends.length === 0 ? (
      <EmptyState
        icon="people-outline"
        title="No activity yet"
        message="Add friends to see their workouts, PRs, and badges here."
        actionLabel="Find Friends"
        onAction={() => router.push('/(tabs)/settings/friends')}
      />
    ) : (
      <EmptyState icon="pulse-outline" title="Nothing yet" message="Finish a workout to start your feed." />
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {events.map((event) => (
        <FeedEventCard key={event.id} event={event} onReact={() => toggleReaction.mutate(event.id)} />
      ))}
      {hasNextPage ? (
        <Button label="Load more" variant="secondary" loading={isFetchingNextPage} onPress={() => fetchNextPage()} />
      ) : null}
    </View>
  );
}

function FeedEventCard({ event, onReact }: { event: FeedEvent; onReact: () => void }) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, backgroundColor: theme.surface, borderRadius: radius.md, padding: spacing.md }}>
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
          {(event.display_name ?? 'A').charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text font="body" size={14}>
          <Text font="body" weight="700" size={14}>
            {event.display_name ?? 'Athlete'}
          </Text>
          {' '}
          {describeEvent(event)}
        </Text>
        <Text font="body" size={12} color="muted">
          {formatRelative(event.created_at)}
        </Text>
      </View>

      <Pressable onPress={onReact} hitSlop={8} accessibilityLabel="Like" style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name={event.reacted_by_me ? 'heart' : 'heart-outline'} size={18} color={event.reacted_by_me ? theme.danger : theme.textMuted} />
        {event.reaction_count > 0 ? (
          <Text font="mono" size={12} color="muted">
            {event.reaction_count}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

function describeEvent(event: FeedEvent): string {
  switch (event.event_type) {
    case 'session_completed': {
      const meta = event.metadata as { duration_seconds?: number; total_sets?: number; workout_type?: string };
      const parts = [meta.workout_type, meta.duration_seconds ? formatDuration(meta.duration_seconds) : null, meta.total_sets ? `${meta.total_sets} sets` : null].filter(Boolean);
      return `completed a workout${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
    }
    case 'pr_set': {
      const meta = event.metadata as { exercise_name?: string; pr_count?: number };
      const extra = meta.pr_count && meta.pr_count > 1 ? ` (${meta.pr_count} records)` : '';
      return `set a new PR on ${meta.exercise_name ?? 'an exercise'}${extra}`;
    }
    case 'badge_unlocked':
      return `unlocked ${event.badge_icon ?? '🏅'} ${event.badge_name ?? 'a badge'}`;
    default:
      return 'had some activity';
  }
}

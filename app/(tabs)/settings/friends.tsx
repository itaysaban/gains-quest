import { useState } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { LoadingState } from '@/components/ui/LoadingState';
import {
  useSearchUsers,
  useFriends,
  usePendingFriendRequests,
  useSendFriendRequest,
  useRespondFriendRequest,
  useRemoveFriend,
} from '@/hooks/useFriends';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { Friend, PendingFriendRequest, UserSearchResult } from '@/types/domain';

/** Friends — PRD §7.4 "Friends and Invite" (P1), not covered by the design handoff ("not designed
 * in this pass"). Scoped to search + request + accept/decline + remove; "invite by link" is a
 * separate deep-linking mechanism, deferred rather than built half-specified. Styled to match the
 * other Settings sub-screens (Pause Mode, Notifications) — this stack hasn't had the design-handoff
 * rebrand applied anywhere else, so matching its existing plain style keeps the Settings section
 * visually consistent rather than introducing the new design language in just one corner of it. */
export default function Friends() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const { data: searchResults, isLoading: searching, error: searchError } = useSearchUsers(query);
  const { data: friends, isLoading: loadingFriends, error: friendsError, refetch: refetchFriends } = useFriends();
  const { data: pending, isLoading: loadingPending, error: pendingError, refetch: refetchPending } = usePendingFriendRequests();
  const sendRequest = useSendFriendRequest();
  const respondRequest = useRespondFriendRequest();
  const removeFriend = useRemoveFriend();

  function handleRemove(friend: Friend) {
    Alert.alert('Remove friend?', `${friend.display_name ?? 'This person'} will no longer see your activity or appear on your friends board.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeFriend.mutate(friend.id) },
    ]);
  }

  if (loadingFriends || loadingPending) return <LoadingState />;

  // Surfaced explicitly rather than silently falling through to "no friends"/"no results" — an RPC
  // error (e.g. a migration not deployed yet) used to look identical to a genuinely empty list.
  const loadError = friendsError ?? pendingError;
  if (loadError) {
    return (
      <Screen scroll>
        <View style={{ gap: spacing.md, alignItems: 'flex-start' }}>
          <Text weight="700">Couldn&apos;t load Friends</Text>
          <Text color="muted">{(loadError as any)?.message ?? 'Something went wrong.'}</Text>
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => {
              refetchFriends();
              refetchPending();
            }}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          <TextField placeholder="Search by name…" value={query} onChangeText={setQuery} autoCapitalize="none" />
          {query.trim().length >= 2 ? (
            <View style={{ gap: spacing.xs }}>
              {searching ? (
                <Text color="muted">Searching…</Text>
              ) : searchError ? (
                <Text color="danger">{(searchError as any)?.message ?? "Search didn't work — try again."}</Text>
              ) : searchResults?.length === 0 ? (
                <Text color="muted">No one found.</Text>
              ) : (
                searchResults?.map((result) => (
                  <SearchResultRow
                    key={result.id}
                    result={result}
                    onAdd={() => sendRequest.mutate(result.id)}
                    sending={sendRequest.isPending && sendRequest.variables === result.id}
                  />
                ))
              )}
            </View>
          ) : null}
        </View>

        {pending && pending.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="subtitle">Requests</Text>
            {pending.map((request) => (
              <PendingRequestRow
                key={request.id}
                request={request}
                onAccept={() => respondRequest.mutate({ requestId: request.id, accept: true })}
                onDecline={() => respondRequest.mutate({ requestId: request.id, accept: false })}
                responding={respondRequest.isPending && respondRequest.variables?.requestId === request.id}
              />
            ))}
          </View>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <Text variant="subtitle">Friends{friends && friends.length > 0 ? ` (${friends.length})` : ''}</Text>
          {!friends || friends.length === 0 ? (
            <Text color="muted">No friends yet — search above to add some.</Text>
          ) : (
            friends.map((friend) => (
              <Card key={friend.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Avatar name={friend.display_name} />
                <Text weight="600" style={{ flex: 1 }}>
                  {friend.display_name ?? 'Athlete'}
                </Text>
                <Pressable onPress={() => handleRemove(friend)} hitSlop={8}>
                  <Text color="danger" variant="caption" weight="600">
                    Remove
                  </Text>
                </Pressable>
              </Card>
            ))
          )}
        </View>
      </View>
    </Screen>
  );
}

function Avatar({ name }: { name: string | null }) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: radius.full,
        backgroundColor: theme.avatarPlaceholder,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text weight="700" style={{ color: theme.text }}>
        {(name ?? 'A').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

function SearchResultRow({ result, onAdd, sending }: { result: UserSearchResult; onAdd: () => void; sending: boolean }) {
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Avatar name={result.display_name} />
      <Text weight="600" style={{ flex: 1 }}>
        {result.display_name ?? 'Athlete'}
      </Text>
      {result.relationship === 'accepted' ? (
        <Text color="muted" variant="caption" weight="600">
          Friends
        </Text>
      ) : result.relationship === 'pending' ? (
        <Text color="muted" variant="caption" weight="600">
          Requested
        </Text>
      ) : (
        <Button label="Add" size="sm" onPress={onAdd} loading={sending} />
      )}
    </Card>
  );
}

function PendingRequestRow({
  request,
  onAccept,
  onDecline,
  responding,
}: {
  request: PendingFriendRequest;
  onAccept: () => void;
  onDecline: () => void;
  responding: boolean;
}) {
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Avatar name={request.display_name} />
      <Text weight="600" style={{ flex: 1 }}>
        {request.display_name ?? 'Athlete'}
      </Text>
      <Button label="Decline" variant="ghost" size="sm" onPress={onDecline} disabled={responding} />
      <Button label="Accept" size="sm" onPress={onAccept} loading={responding} />
    </Card>
  );
}

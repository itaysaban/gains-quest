import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { FeedEvent } from '@/types/domain';

const FEED_PAGE_SIZE = 20;

/** M4 Story 3: self + accepted friends' activity, reverse-chronological, cursor-paginated on
 * created_at (fn_friend_feed's p_before). A page shorter than FEED_PAGE_SIZE means there's no more
 * history to load. */
export function useFriendFeed() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useInfiniteQuery({
    queryKey: ['friend-feed', userId],
    enabled: !!userId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FeedEvent[]> => {
      const { data, error } = await supabase.rpc('fn_friend_feed', { p_limit: FEED_PAGE_SIZE, p_before: pageParam });
      if (error) throw error;
      return data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.length === FEED_PAGE_SIZE ? lastPage[lastPage.length - 1].created_at : undefined,
  });
}

/** Session Summary's "Include weights and loads" toggle (second design handoff, 2026-09-01). The
 * session_completed feed event already exists by the time this screen renders (fn_complete_session
 * posted it) — this just patches that one event's metadata after the fact. Not surfaced through the
 * friend-feed cache directly (the toggle lives on a screen the viewer's own feed query isn't even
 * mounted on), so no optimistic cache patch — a plain mutation is enough. */
export function useUpdateSessionFeedPrivacy() {
  return useMutation({
    mutationFn: async ({ sessionId, includeWeights }: { sessionId: string; includeWeights: boolean }): Promise<void> => {
      const { error } = await supabase.rpc('fn_update_session_feed_privacy', {
        p_session_id: sessionId,
        p_include_weights: includeWeights,
      });
      if (error) throw error;
    },
  });
}

type FeedPages = InfiniteData<FeedEvent[], string | null>;

export function useToggleReaction() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const queryKey = ['friend-feed', userId];

  return useMutation({
    mutationFn: async (feedEventId: string): Promise<boolean> => {
      const { data, error } = await supabase.rpc('fn_toggle_reaction', { p_feed_event_id: feedEventId });
      if (error) throw error;
      return data;
    },
    onMutate: async (feedEventId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<FeedPages>(queryKey);
      queryClient.setQueryData<FeedPages>(queryKey, (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((page) =>
                page.map((event) =>
                  event.id === feedEventId
                    ? {
                        ...event,
                        reacted_by_me: !event.reacted_by_me,
                        reaction_count: event.reaction_count + (event.reacted_by_me ? -1 : 1),
                      }
                    : event,
                ),
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (_err, _feedEventId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

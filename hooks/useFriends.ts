import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Friend, FriendRequest, PendingFriendRequest, UserSearchResult } from '@/types/domain';

/** M4 Story 1: search returns only id/display_name/avatar_url/relationship — never a broad "browse
 * everyone" capability. Profiles stay friends-only by default (PRD §9); this is the one controlled
 * window through that, via fn_search_users (SECURITY DEFINER). Disabled for a query under 2
 * characters — matches would otherwise be too broad to be useful and hit the table on every keystroke. */
export function useSearchUsers(query: string) {
  return useQuery({
    queryKey: ['user-search', query],
    enabled: query.trim().length >= 2,
    queryFn: async (): Promise<UserSearchResult[]> => {
      const { data, error } = await supabase.rpc('fn_search_users', { p_query: query.trim() });
      if (error) throw error;
      return data;
    },
  });
}

export function useFriends() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['friends', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Friend[]> => {
      const { data, error } = await supabase.rpc('fn_list_friends', { p_user_id: userId! });
      if (error) throw error;
      return data;
    },
  });
}

/** Incoming requests awaiting this user's response — not requests they've sent (fn_pending_friend_requests
 * is addressee-scoped only, see the migration). */
export function usePendingFriendRequests() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['pending-friend-requests', userId],
    enabled: !!userId,
    queryFn: async (): Promise<PendingFriendRequest[]> => {
      const { data, error } = await supabase.rpc('fn_pending_friend_requests', { p_user_id: userId! });
      if (error) throw error;
      return data;
    },
  });
}

export function useSendFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (addresseeId: string): Promise<FriendRequest> => {
      const { data, error } = await supabase.rpc('fn_send_friend_request', { p_addressee_id: addresseeId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-search'] });
    },
  });
}

export function useRespondFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ requestId, accept }: { requestId: string; accept: boolean }): Promise<FriendRequest> => {
      const { data, error } = await supabase.rpc('fn_respond_friend_request', { p_request_id: requestId, p_accept: accept });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['user-search'] });
    },
  });
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (friendId: string): Promise<void> => {
      const { error } = await supabase.rpc('fn_remove_friend', { p_friend_id: friendId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['user-search'] });
    },
  });
}

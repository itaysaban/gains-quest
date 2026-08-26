import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Challenge } from '@/types/domain';

/** M4 Story 4 — a fixed, server-config pool of week-scoped challenges every user sees the same set
 * of. fn_active_challenges lazily assigns the current week's rows and recomputes progress on every
 * call (it's a SECURITY DEFINER write, not a pure read) — a plain useQuery is enough, no mutation
 * hook needed since there's no user-initiated action here beyond viewing. */
export function useActiveChallenges() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['active-challenges', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Challenge[]> => {
      const { data, error } = await supabase.rpc('fn_active_challenges', { p_user_id: userId! });
      if (error) throw error;
      return data;
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Challenge } from '@/types/domain';

/** Where useCompleteSession stashes the pre-session quest snapshot that useQuestGains diffs against.
 * Cache-only (never fetched) — it's a handoff between "a session just completed" and the Quest
 * Progress screen that follows, not server state in its own right. */
export const challengeBaselineKey = ['challenge-baseline'] as const;

/** M4 Story 4 (Daily Quests, redesigned 2026-09-01) — a fixed, server-config pool of day-scoped
 * quests every user sees the same set of. fn_active_challenges lazily assigns the current day's
 * rows and recomputes progress on every call (it's a SECURITY DEFINER write, not a pure read) — a
 * plain useQuery is enough for reads; the only user-initiated write is claiming (below). */
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

/** Claims a single ready_to_claim quest, awarding its GP. Optimistically flips the row to
 * 'completed' so the tap feels instant; onSettled refetches to reconcile with the server (which
 * also recomputes progress for the *other* quests, not just this one, so a full refetch is
 * correct here rather than a narrower cache patch). */
export function useClaimChallenge() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const queryKey = ['active-challenges', userId];

  return useMutation({
    mutationFn: async (userChallengeId: string): Promise<void> => {
      const { error } = await supabase.rpc('fn_claim_challenge', { p_user_challenge_id: userChallengeId });
      if (error) throw error;
    },
    onMutate: async (userChallengeId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Challenge[]>(queryKey);
      queryClient.setQueryData<Challenge[]>(queryKey, (old) =>
        old?.map((c) => (c.id === userChallengeId ? { ...c, status: 'completed' as const } : c)),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

export interface QuestGain {
  challenge: Challenge;
  /** True when THIS session moved the needle on this quest — the only ones worth animating. */
  gained: boolean;
}

/** Diffs today's quests against the snapshot taken just before the last session completed, so the
 * Quest Progress screen can (a) be skipped entirely when a workout advanced nothing and (b) animate
 * only the bars that actually moved. Matched on `code`, not row id: a dev reset (or the day rolling
 * over mid-session) replaces the underlying user_challenges rows, and an id match would then read as
 * "everything is new" rather than diffing like for like. No baseline in cache (e.g. the screen was
 * opened without a session completing first) means nothing is treated as gained. */
export function useQuestGains(): { gains: QuestGain[]; hasAnyGain: boolean; isLoading: boolean } {
  const { data: challenges, isLoading } = useActiveChallenges();
  const queryClient = useQueryClient();
  const baseline = queryClient.getQueryData<Challenge[]>(challengeBaselineKey);

  const gains = (challenges ?? []).map((challenge) => {
    const before = baseline?.find((b) => b.code === challenge.code);
    return { challenge, gained: before ? challenge.progress_value > before.progress_value : false };
  });

  return { gains, hasAnyGain: gains.some((g) => g.gained), isLoading };
}

/** Dev-only: deletes the caller's own today's user_challenges rows so the next
 * useActiveChallenges read re-assigns a fresh 'active' set. Does not touch already-claimed GP. */
export function useResetChallenges() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { error } = await supabase.rpc('fn_dev_reset_challenges', { p_user_id: userId! });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['active-challenges', userId] }),
  });
}

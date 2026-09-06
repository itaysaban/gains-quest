import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Badge, LeaderboardRow, PersonalRecord, Streak, UserBadge } from '@/types/domain';
import type { PointSource } from '@/types/database.types';

export function useStreak() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['streak', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Streak> => {
      const { data, error } = await supabase.from('streaks').select('*').eq('user_id', userId!).single();
      if (error) throw error;
      return data;
    },
  });
}

/** M3 Epic 2 Story 2.5: enables Pause Mode for up to 14 days/quarter (server clamps an over-request
 * to whatever's left rather than rejecting it). While active, fn_update_streak holds the counter —
 * no increment, no break — for every day in the window. */
export function useEnablePauseMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (days: number): Promise<{ paused_until: string; days_granted: number; days_remaining_this_quarter: number }> => {
      const { data, error } = await supabase.rpc('fn_enable_pause_mode', { p_days: days });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      queryClient.invalidateQueries({ queryKey: ['pause-days-used'] });
    },
  });
}

/** M3 Epic 2 Story 2.5 (extended): ends Pause Mode early. Refunds every elapsed day the user actually
 * trained through — only days with no completed session count against the quarterly budget — see
 * 20260816000004_pause_periods_ledger.sql. */
export function useCancelPauseMode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ days_refunded: number; days_used: number }> => {
      const { data, error } = await supabase.rpc('fn_cancel_pause_mode');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      queryClient.invalidateQueries({ queryKey: ['pause-days-used'] });
    },
  });
}

/** M3 Epic 2 Story 2.5 (redesign): how many pause days have actually been used this quarter, computed
 * fresh from real pause history + workout activity every time — not a stored counter. Supersedes
 * reading streaks.pause_days_used_this_quarter/pause_quarter_start directly. */
export function usePauseDaysUsedThisQuarter() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['pause-days-used', userId],
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('fn_pause_days_used_this_quarter', { p_user_id: userId! });
      if (error) throw error;
      return data;
    },
  });
}

export function useAllBadges() {
  return useQuery({
    queryKey: ['all-badges'],
    queryFn: async (): Promise<Badge[]> => {
      const { data, error } = await supabase.from('badges').select('*').order('category');
      if (error) throw error;
      return data;
    },
  });
}

export function useUserBadges() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['badges', userId],
    enabled: !!userId,
    queryFn: async (): Promise<UserBadge[]> => {
      const { data, error } = await supabase
        .from('user_badges')
        .select('*')
        .eq('user_id', userId!)
        .order('unlocked_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export interface LifetimeStats {
  total_gp: number;
  sessions: number;
  volume_kg: number;
  prs: number;
  badges_unlocked: number;
  badges_total: number;
  /** M4 Story 2: the caller's current-season global rank, or null with no season activity yet —
   * still never a fabricated number when there's genuinely nothing to rank. */
  season_rank: number | null;
}

/** M3 Epic 3 Story 3.3 (design handoff): the Achievement Hall's LIFETIME card. */
export function useLifetimeStats() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['lifetime-stats', userId],
    enabled: !!userId,
    queryFn: async (): Promise<LifetimeStats> => {
      const { data, error } = await supabase.rpc('fn_lifetime_stats', { p_user_id: userId! });
      if (error) throw error;
      return data;
    },
  });
}

/** M3 Epic 3 Story 3.3 (design handoff): live progress toward each of the user's still-locked
 * badges, keyed by badge_id. A null value means that badge's criteria type has no natural "current /
 * target" reading (e.g. cardio_time_for_distance) — the UI should fall back to the plain requirement
 * text rather than inventing a fraction. */
export function useBadgeProgress() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['badge-progress', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Record<string, number | null>> => {
      const { data, error } = await supabase.rpc('fn_badge_progress', { p_user_id: userId! });
      if (error) throw error;
      return Object.fromEntries(data.map((row) => [row.badge_id, row.current_value]));
    },
  });
}

/** M3 Epic 3 Story 3.3: a single completed session's total GainPoints, summed live from point_ledger
 * (base/volume/cardio/pr/routine — the same sources fn_award_points_for_session awards, achievement
 * entries are keyed by badge not session and intentionally excluded) rather than a persisted column —
 * stays correct even after a recalculation inserts reversal/re-award entries. */
export function useSessionPoints(sessionId?: string) {
  return useQuery({
    queryKey: ['session-points', sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.from('point_ledger').select('points').eq('session_id', sessionId!);
      if (error) throw error;
      return data.reduce((sum, row) => sum + row.points, 0);
    },
  });
}

/** Session Summary's itemised GAINPOINTS card (design handoff §4, PRD §6.2): "the client never
 * computes or submits point totals" — every line comes straight from the point_ledger rows this
 * exact session inserted, summed per source (base/volume/cardio/pr/routine; achievement entries have
 * no session_id and are correctly excluded — a badge unlock isn't "this session's" points). */
export function useSessionPointBreakdown(sessionId?: string) {
  return useQuery({
    queryKey: ['session-point-breakdown', sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<{ source: PointSource; points: number }[]> => {
      const { data, error } = await supabase.from('point_ledger').select('source, points').eq('session_id', sessionId!);
      if (error) throw error;
      const bySource = new Map<PointSource, number>();
      for (const row of data) bySource.set(row.source, (bySource.get(row.source) ?? 0) + row.points);
      return Array.from(bySource, ([source, points]) => ({ source, points })).filter((row) => row.points !== 0);
    },
  });
}

/** Session Summary's daily-ceiling line ("234 of 400 used today") — sums today's session-sourced GP
 * the same way fn_award_points_for_session's own ceiling check does (base/volume/cardio/pr/routine;
 * achievement GP is exempt from the ceiling by design and excluded here too). */
export function useTodayPointsEarned() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['today-points-earned', userId],
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('point_ledger')
        .select('points')
        .eq('user_id', userId!)
        .in('source', ['base', 'volume', 'cardio', 'pr', 'routine'])
        .gte('created_at', todayStart.toISOString());
      if (error) throw error;
      return data.reduce((sum, row) => sum + row.points, 0);
    },
  });
}

/** M4 Story 2: current-season leaderboard (PRD §6.2). 'global' returns only the caller's own ~100-
 * person tier ("ranking against everyone is meaningless at scale"); 'friends' is unbounded and
 * always includes the caller, even with zero friends or zero season GP — the "no friends yet" empty
 * state is the screen's call on the friends list being just the caller alone, not this hook's. */
export function useLeaderboard(scope: 'global' | 'friends') {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['leaderboard', scope, userId],
    enabled: !!userId,
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await supabase.rpc('fn_leaderboard', { p_scope: scope });
      if (error) throw error;
      return data;
    },
  });
}

/** Archives any season that has closed since the last visit, then reports how many it wrote.
 *
 * This is the whole trigger for season rollover — there is no scheduled job, so if nothing calls
 * this, no season is ever archived. It runs on the Leaderboard screen because that is the surface
 * where a rolled-over season is visible; the call is a cheap no-op once a season is archived (one
 * existence check per past season), so mounting repeatedly costs nothing.
 *
 * A failure here is deliberately not surfaced to the user: archival is bookkeeping, it retries on
 * the next mount, and a broken archive should never stop the live board from rendering. */
export function useEnsureSeasonsArchived() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['seasons-archived', userId],
    enabled: !!userId,
    staleTime: 1000 * 60 * 60,
    retry: false,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('fn_ensure_seasons_archived', {});
      if (error) throw error;
      return data ?? 0;
    },
  });
}

/** The caller's own archived finishes, newest first — "final standings are archived to the user's
 * profile" (PRD §6.2). Empty until at least one season has closed and been archived. */
export function useMySeasons() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['my-seasons', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_my_seasons', {});
      if (error) throw error;
      return data;
    },
  });
}

/** The caller's most recent completed season, with whether they were promoted or relegated relative
 * to the last season they actually placed in. Null until a season has closed AND been archived, so
 * the calling screen must treat absence as the normal first-month state, not an error. */
export function useLastSeason() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['last-season', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_last_season', {});
      if (error) throw error;
      return data;
    },
  });
}

export function usePersonalRecords(exerciseId?: string) {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['personal-records', userId, exerciseId],
    enabled: !!userId,
    queryFn: async (): Promise<PersonalRecord[]> => {
      let query = supabase
        .from('personal_records')
        .select('*')
        .eq('user_id', userId!)
        .order('achieved_at', { ascending: false });
      if (exerciseId) query = query.eq('exercise_id', exerciseId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Badge, PersonalRecord, Streak, UserBadge } from '@/types/domain';

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
}

/** M3 Epic 3 Story 3.3 (design handoff): the Achievement Hall's LIFETIME card. Season rank isn't
 * included — that's an M4 dependency (seasonal leaderboards don't exist yet); render a static
 * placeholder for it client-side. */
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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { Badge, PersonalRecord, Streak, UserBadge, UserLevel } from '@/types/domain';

export function useUserLevel() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['user-level', userId],
    enabled: !!userId,
    queryFn: async (): Promise<UserLevel> => {
      const { data, error } = await supabase.from('user_levels').select('*').eq('user_id', userId!).single();
      if (error) throw error;
      return data;
    },
  });
}

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

import { useQuery } from '@tanstack/react-query';
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

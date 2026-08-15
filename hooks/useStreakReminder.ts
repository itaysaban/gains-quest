import { useEffect } from 'react';
import { useStreak } from '@/hooks/useGamification';
import { useRecentSessions } from '@/hooks/useWorkoutSession';
import { useNotificationPreferences } from '@/hooks/useNotificationPreferences';
import { useProfile } from '@/hooks/useProfile';
import { scheduleStreakReminder } from '@/lib/notifications/streakReminder';

/** M3 Epic 2 Story 2.6: (re)schedules today's streak notification — a plain reminder, an at-risk
 * nudge, or nothing — whenever the inputs it depends on change. Mount once near the app root (or on
 * Home, which already loads streak data); scheduleStreakReminder always clears any prior pending
 * notification first, so re-running this on every dependency change is safe and never stacks. */
export function useStreakReminder() {
  const { data: streak } = useStreak();
  const { data: profile } = useProfile();
  const { data: prefs } = useNotificationPreferences();
  const { data: recentSessions } = useRecentSessions();

  useEffect(() => {
    if (!streak || !profile || !prefs) return;

    scheduleStreakReminder({
      streak,
      weeklyGoalDays: profile.weekly_goal_days,
      enabled: prefs.streak_warnings_enabled,
      recentSessionStartTimes: (recentSessions ?? []).map((s) => s.started_at),
    }).catch(() => {});
  }, [streak, profile, prefs, recentSessions]);
}

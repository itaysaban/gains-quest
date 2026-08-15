import * as Notifications from 'expo-notifications';
import { startOfWeek } from 'date-fns';
import { isoDateOnly, trainingLocalDate } from '@/lib/utils/date';
import type { Streak } from '@/types/domain';

// M3 Epic 2 Story 2.6: a single identifier so re-scheduling always replaces (never stacks on top of)
// whatever was scheduled before — at most one streak notification pending at any time.
const STREAK_REMINDER_ID = 'streak-reminder';

/** Most common hour-of-day (device-local) the user has started a session, from recent history.
 * Falls back to 18:00 with no history yet. */
export function pickReminderHour(recentSessionStartTimes: string[]): number {
  if (recentSessionStartTimes.length === 0) return 18;
  const counts = new Map<number, number>();
  for (const iso of recentSessionStartTimes) {
    const hour = new Date(iso).getHours();
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }
  let bestHour = 18;
  let bestCount = -1;
  for (const [hour, count] of counts) {
    if (count > bestCount) {
      bestHour = hour;
      bestCount = count;
    }
  }
  return bestHour;
}

/** streaks.rest_used_this_week only means anything for the ISO week it was last written against —
 * once the calendar has rolled into a new week, an unrefreshed row's counter reads as 0 rest days
 * spent, matching what fn_update_streak would compute on its next write. */
export function restUsedThisWeek(streak: Pick<Streak, 'rest_used_this_week' | 'rest_week_start'>, now: Date = new Date()): number {
  if (!streak.rest_week_start) return 0;
  const currentWeekStart = isoDateOnly(startOfWeek(now, { weekStartsOn: 1 }));
  return streak.rest_week_start === currentWeekStart ? streak.rest_used_this_week : 0;
}

export function isPausedOn(streak: Pick<Streak, 'paused_until' | 'pause_started_at'>, localDate: string): boolean {
  if (!streak.paused_until || !streak.pause_started_at) return false;
  return localDate >= streak.pause_started_at && localDate <= streak.paused_until;
}

export interface StreakRiskInput {
  streak: Pick<Streak, 'last_workout_date' | 'rest_used_this_week' | 'rest_week_start' | 'freezes_banked' | 'paused_until' | 'pause_started_at'>;
  weeklyGoalDays: number;
  now?: Date;
}

/** Story 2.6's decision of what (if anything) should fire today. 'none' covers: already trained
 * today, Pause Mode active, or rest allowance/freezes still available (no reason to nudge yet). */
export function evaluateStreakReminder(input: StreakRiskInput): 'none' | 'reminder' | 'at_risk' {
  const now = input.now ?? new Date();
  const today = trainingLocalDate(now);

  if (isPausedOn(input.streak, today)) return 'none';
  if (input.streak.last_workout_date === today) return 'none';

  const restAllowance = Math.max(0, 7 - input.weeklyGoalDays);
  const usedThisWeek = restUsedThisWeek(input.streak, now);
  const exhausted = usedThisWeek >= restAllowance && input.streak.freezes_banked <= 0;

  return exhausted ? 'at_risk' : 'reminder';
}

/** No guilt-framed copy (e.g. no "you're losing your streak!") — matches the PRD's wellbeing
 * requirement. Informational, not pressuring. */
export function streakNotificationContent(kind: 'reminder' | 'at_risk'): { title: string; body: string } {
  if (kind === 'at_risk') {
    return {
      title: 'Streak check-in',
      body: "You're out of rest days and freezes for this week — log a workout today to keep it going.",
    };
  }
  return {
    title: 'Training reminder',
    body: "Haven't logged a workout yet today — whenever you're ready.",
  };
}

/** Cancels any previously scheduled streak reminder, then schedules today's (if any is warranted)
 * near the user's historical training time. Safe to call repeatedly — e.g. once per app foreground
 * and once after every session completes — since it always starts by clearing the old one. */
export async function scheduleStreakReminder(
  input: StreakRiskInput & { recentSessionStartTimes: string[]; enabled: boolean },
): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID).catch(() => {});

  if (!input.enabled) return;

  const kind = evaluateStreakReminder(input);
  if (kind === 'none') return;

  const now = input.now ?? new Date();
  const hour = pickReminderHour(input.recentSessionStartTimes);
  const fireDate = new Date(now);
  fireDate.setHours(hour, 0, 0, 0);
  if (fireDate.getTime() <= now.getTime()) return;

  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_REMINDER_ID,
    content: streakNotificationContent(kind),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
  });
}

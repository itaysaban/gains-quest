import {
  pickReminderHour,
  restUsedThisWeek,
  isPausedOn,
  evaluateStreakReminder,
  streakNotificationContent,
} from '../streakReminder';
import type { Streak } from '@/types/domain';

function makeStreak(overrides: Partial<Streak> = {}): Pick<
  Streak,
  'last_workout_date' | 'rest_used_this_week' | 'rest_week_start' | 'freezes_banked' | 'paused_until' | 'pause_started_at'
> {
  return {
    last_workout_date: null,
    rest_used_this_week: 0,
    rest_week_start: null,
    freezes_banked: 0,
    paused_until: null,
    pause_started_at: null,
    ...overrides,
  };
}

describe('pickReminderHour', () => {
  it('defaults to 6pm with no history', () => {
    expect(pickReminderHour([])).toBe(18);
  });

  it('picks the most common hour-of-day from history', () => {
    const times = [
      new Date(2026, 7, 1, 7, 5).toISOString(),
      new Date(2026, 7, 3, 7, 20).toISOString(),
      new Date(2026, 7, 5, 19, 0).toISOString(),
    ];
    expect(pickReminderHour(times)).toBe(7);
  });
});

describe('restUsedThisWeek', () => {
  it('returns 0 when rest_week_start was never set', () => {
    expect(restUsedThisWeek(makeStreak({ rest_week_start: null, rest_used_this_week: 3 }))).toBe(0);
  });

  it('returns the stored count when rest_week_start matches the current ISO week', () => {
    const now = new Date(2026, 7, 13); // Thursday, Aug 13 2026 -> ISO week starts Mon Aug 10
    expect(restUsedThisWeek(makeStreak({ rest_week_start: '2026-08-10', rest_used_this_week: 2 }), now)).toBe(2);
  });

  it('returns 0 when rest_week_start is a stale (prior) week', () => {
    const now = new Date(2026, 7, 13);
    expect(restUsedThisWeek(makeStreak({ rest_week_start: '2026-08-03', rest_used_this_week: 3 }), now)).toBe(0);
  });
});

describe('isPausedOn', () => {
  it('is false when no pause window is set', () => {
    expect(isPausedOn(makeStreak(), '2026-08-13')).toBe(false);
  });

  it('is true for a date inside the paused window (inclusive on both ends)', () => {
    const streak = makeStreak({ pause_started_at: '2026-08-10', paused_until: '2026-08-17' });
    expect(isPausedOn(streak, '2026-08-10')).toBe(true);
    expect(isPausedOn(streak, '2026-08-14')).toBe(true);
    expect(isPausedOn(streak, '2026-08-17')).toBe(true);
  });

  it('is false for a date outside the paused window', () => {
    const streak = makeStreak({ pause_started_at: '2026-08-10', paused_until: '2026-08-17' });
    expect(isPausedOn(streak, '2026-08-09')).toBe(false);
    expect(isPausedOn(streak, '2026-08-18')).toBe(false);
  });
});

describe('evaluateStreakReminder', () => {
  const now = new Date(2026, 7, 13, 12, 0); // Thursday, Aug 13 2026, noon

  it('returns none when already logged today', () => {
    const streak = makeStreak({ last_workout_date: '2026-08-13' });
    expect(evaluateStreakReminder({ streak, weeklyGoalDays: 4, now })).toBe('none');
  });

  it('returns none when Pause Mode is active today', () => {
    const streak = makeStreak({ pause_started_at: '2026-08-12', paused_until: '2026-08-15' });
    expect(evaluateStreakReminder({ streak, weeklyGoalDays: 4, now })).toBe('none');
  });

  it('returns reminder when rest allowance or a freeze is still available', () => {
    const streak = makeStreak({ rest_week_start: '2026-08-10', rest_used_this_week: 1, freezes_banked: 0 });
    // weeklyGoalDays 4 -> rest_allowance 3, only 1 used -> not exhausted.
    expect(evaluateStreakReminder({ streak, weeklyGoalDays: 4, now })).toBe('reminder');
  });

  it('returns at_risk when both rest allowance and freezes are exhausted', () => {
    const streak = makeStreak({ rest_week_start: '2026-08-10', rest_used_this_week: 3, freezes_banked: 0 });
    expect(evaluateStreakReminder({ streak, weeklyGoalDays: 4, now })).toBe('at_risk');
  });

  it('returns reminder (not at_risk) when a banked freeze is still available even with allowance exhausted', () => {
    const streak = makeStreak({ rest_week_start: '2026-08-10', rest_used_this_week: 3, freezes_banked: 1 });
    expect(evaluateStreakReminder({ streak, weeklyGoalDays: 4, now })).toBe('reminder');
  });
});

describe('streakNotificationContent', () => {
  it('never uses guilt-framed language', () => {
    const guiltPhrases = /losing|lose your streak|don't break|failing/i;
    expect(streakNotificationContent('reminder').body).not.toMatch(guiltPhrases);
    expect(streakNotificationContent('at_risk').body).not.toMatch(guiltPhrases);
  });
});

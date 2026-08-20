import { pointSourceLabel, streakMultiplier } from '../points';

// PRD §6.2 streak multiplier table: 0-2 days 1.0x, 3-6 days 1.1x, 7-29 days 1.25x, 30+ days 1.4x —
// applied to session-sourced GP only. This mirrors fn_award_points_for_session's own tier table
// (20260814000010_point_reversal_recalc.sql) for display purposes on Session Summary.
describe('streakMultiplier', () => {
  it('returns 1.0 at 0 days (the bottom of the first tier)', () => {
    expect(streakMultiplier(0)).toBe(1.0);
  });

  it('returns 1.0 at 2 days (the top of the first tier)', () => {
    expect(streakMultiplier(2)).toBe(1.0);
  });

  it('returns 1.1 at 3 days (the bottom of the second tier)', () => {
    expect(streakMultiplier(3)).toBe(1.1);
  });

  it('returns 1.1 at 6 days (the top of the second tier)', () => {
    expect(streakMultiplier(6)).toBe(1.1);
  });

  it('returns 1.25 at 7 days (the bottom of the third tier)', () => {
    expect(streakMultiplier(7)).toBe(1.25);
  });

  it('returns 1.25 at 29 days (the top of the third tier)', () => {
    expect(streakMultiplier(29)).toBe(1.25);
  });

  it('returns 1.4 at 30 days (the bottom of the top tier)', () => {
    expect(streakMultiplier(30)).toBe(1.4);
  });

  it('stays at 1.4 well past 30 days — the top tier has no ceiling', () => {
    expect(streakMultiplier(100)).toBe(1.4);
  });
});

// PRD §6.2 earning-rules table sources: Base session, Strength volume, Cardio and duration,
// Personal record, Routine completion — labels here are the Session Summary itemised breakdown's
// short forms of each.
describe('pointSourceLabel', () => {
  it.each([
    ['base', 'Base session'],
    ['volume', 'Volume'],
    ['cardio', 'Cardio'],
    ['pr', 'Personal record'],
    ['routine', 'Routine completed'],
  ])('maps %s to %s', (source, label) => {
    expect(pointSourceLabel(source)).toBe(label);
  });

  it('falls back to the raw string for an unrecognized source instead of throwing', () => {
    expect(pointSourceLabel('achievement')).toBe('achievement');
    expect(pointSourceLabel('made-up-source')).toBe('made-up-source');
  });
});

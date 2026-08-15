import { formatDuration, formatRelative, formatShortDate, secondsSince, lastNDays, isoDateOnly, trainingLocalDate } from '../date';

describe('formatDuration', () => {
  it('formats seconds only when under a minute', () => {
    expect(formatDuration(45)).toBe('45s');
  });

  it('formats minutes and seconds when under an hour', () => {
    expect(formatDuration(125)).toBe('2m 5s');
  });

  it('formats hours and minutes when an hour or more', () => {
    expect(formatDuration(3725)).toBe('1h 2m');
  });

  it('treats zero seconds as "0s"', () => {
    expect(formatDuration(0)).toBe('0s');
  });
});

describe('formatShortDate', () => {
  it('formats an ISO date as "MMM d"', () => {
    expect(formatShortDate('2026-03-05T12:00:00.000Z')).toBe('Mar 5');
  });
});

describe('isoDateOnly', () => {
  it('formats a Date as yyyy-MM-dd', () => {
    expect(isoDateOnly(new Date(2026, 2, 5))).toBe('2026-03-05');
  });

  it('pads single-digit months and days', () => {
    expect(isoDateOnly(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

describe('trainingLocalDate', () => {
  // M3 Epic 2 Story 2.4: a session started before 4am local counts toward the previous day, so
  // late-night training doesn't get penalized for crossing midnight.
  it('uses the calendar date as-is at or after 4am', () => {
    expect(trainingLocalDate(new Date(2026, 7, 13, 4, 0))).toBe('2026-08-13');
    expect(trainingLocalDate(new Date(2026, 7, 13, 23, 59))).toBe('2026-08-13');
  });

  it('rolls back to the previous day before 4am', () => {
    expect(trainingLocalDate(new Date(2026, 7, 13, 1, 30))).toBe('2026-08-12');
    expect(trainingLocalDate(new Date(2026, 7, 13, 3, 59))).toBe('2026-08-12');
  });

  it('rolls back across a month boundary correctly', () => {
    expect(trainingLocalDate(new Date(2026, 8, 1, 0, 30))).toBe('2026-08-31');
  });
});

describe('time-relative helpers', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-13T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('secondsSince computes whole seconds elapsed since the given ISO timestamp', () => {
    expect(secondsSince('2026-08-13T11:59:00.000Z')).toBe(60);
  });

  it('secondsSince returns 0 for a timestamp equal to now', () => {
    expect(secondsSince('2026-08-13T12:00:00.000Z')).toBe(0);
  });

  it('formatRelative describes a past timestamp with a suffix', () => {
    expect(formatRelative('2026-08-12T12:00:00.000Z')).toBe('1 day ago');
  });

  it('lastNDays returns n days ending today, in ascending order', () => {
    const days = lastNDays(7);
    expect(days).toHaveLength(7);
    expect(isoDateOnly(days[days.length - 1])).toBe('2026-08-13');
    expect(isoDateOnly(days[0])).toBe('2026-08-07');
  });
});

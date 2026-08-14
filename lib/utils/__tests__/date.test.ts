import { formatDuration, formatRelative, formatShortDate, secondsSince, lastNDays, isoDateOnly } from '../date';

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

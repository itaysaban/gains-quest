import { format, formatDistanceToNowStrict, differenceInSeconds, eachDayOfInterval, subDays, startOfQuarter } from 'date-fns';

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatRelative(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function formatShortDate(iso: string): string {
  return format(new Date(iso), 'MMM d');
}

export function secondsSince(iso: string): number {
  return differenceInSeconds(new Date(), new Date(iso));
}

export function lastNDays(n: number): Date[] {
  return eachDayOfInterval({ start: subDays(new Date(), n - 1), end: new Date() });
}

export function isoDateOnly(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** The "training day" a session starting right now belongs to, per the streak's 4am grace window
 * (M3 Epic 2 Story 2.4 / PRD 6.3): a session started before 4am local counts toward the *previous*
 * calendar day, so training past midnight doesn't get penalized for crossing into a new date. */
export function trainingLocalDate(date: Date = new Date()): string {
  const effective = date.getHours() < 4 ? subDays(date, 1) : date;
  return isoDateOnly(effective);
}

/** Matches Postgres's date_trunc('quarter', ...) — used to tell whether a streak row's
 * pause_quarter_start is still the current quarter (M3 Epic 2 Story 2.5). */
export function isoQuarterStart(date: Date = new Date()): string {
  return isoDateOnly(startOfQuarter(date));
}

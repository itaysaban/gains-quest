import { format, formatDistanceToNowStrict, differenceInSeconds, eachDayOfInterval, subDays } from 'date-fns';

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

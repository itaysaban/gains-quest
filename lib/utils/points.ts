const SOURCE_LABEL: Record<string, string> = {
  base: 'Base session',
  volume: 'Volume',
  cardio: 'Cardio',
  pr: 'Personal record',
  routine: 'Routine completed',
};

export function pointSourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

/** Mirrors fn_award_points_for_session's own tier table (20260814000010_point_reversal_recalc.sql)
 * exactly — display-only, presentation logic reconstructing a value the server already applied but
 * doesn't return separately. PRD §6.2. */
export function streakMultiplier(currentStreakDays: number): number {
  if (currentStreakDays >= 30) return 1.4;
  if (currentStreakDays >= 7) return 1.25;
  if (currentStreakDays >= 3) return 1.1;
  return 1.0;
}

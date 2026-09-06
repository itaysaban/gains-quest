import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSessionStore } from '@/store/sessionStore';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import type { SessionExerciseWithSets } from '@/types/domain';
import type { UnitPreference } from '@/types/database.types';

/** Tracking types where the session is about time and distance rather than load. */
const CARDIO_TRACKING = ['distance_duration', 'distance', 'time'];

export function isCardioSession(sessionExercises: SessionExerciseWithSets[] | undefined): boolean {
  if (!sessionExercises?.length) return false;
  return sessionExercises.some((se) => CARDIO_TRACKING.includes(se.exercise.tracking_type));
}

/** A glanceable clock for a cardio session.
 *
 * The header already shows elapsed time, but at 12px alongside a volume-in-kg readout — fine when
 * you are standing between sets, useless when you are running and looking at the phone for a second.
 * This is the same elapsed value rendered big, with distance and pace in place of load.
 *
 * Distance and pace only appear once a set has actually been logged: the app has no GPS, so there is
 * nothing to show live. Rendering "0.00 km" while someone is two kilometres in would be worse than
 * showing nothing, because it looks like tracking that has failed rather than tracking that was
 * never claimed. */
export function CardioSessionPanel({
  sessionExercises,
  isPaused,
  unit,
}: {
  sessionExercises: SessionExerciseWithSets[];
  isPaused: boolean;
  unit: UnitPreference;
}) {
  const theme = useTheme();
  const elapsedSeconds = useSessionStore((s) => s.elapsedSeconds);
  const [, forceTick] = useState(0);

  // Same 1s tick the header timer uses: elapsedSeconds() is a store method derived from the start
  // timestamp, not reactive state, so something has to drive the re-render.
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [isPaused]);

  const seconds = elapsedSeconds();

  const totals = sessionExercises
    .filter((se) => CARDIO_TRACKING.includes(se.exercise.tracking_type))
    .flatMap((se) => se.sets)
    .reduce(
      (acc, s) => ({
        meters: acc.meters + (s.distance_meters ?? 0),
        loggedSeconds: acc.loggedSeconds + (s.time_seconds ?? 0),
      }),
      { meters: 0, loggedSeconds: 0 },
    );

  const hasDistance = totals.meters > 0;
  const distanceLabel = unit === 'lb'
    ? `${(totals.meters / 1609.344).toFixed(2)} mi`
    : `${(totals.meters / 1000).toFixed(2)} km`;

  // Pace comes from logged time where available, falling back to elapsed — a run logged as one set
  // at the end has its own duration, but mid-session the wall clock is the honest approximation.
  const paceBasis = totals.loggedSeconds > 0 ? totals.loggedSeconds : seconds;
  const paceLabel = hasDistance ? formatPace(paceBasis, totals.meters, unit) : null;

  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderRadius: radius.lg,
        padding: spacing.lg,
        gap: 4,
        alignItems: 'center',
      }}
    >
      <Text font="mono" size={11} color="muted" style={{ letterSpacing: 2 }}>
        {isPaused ? 'PAUSED' : 'ELAPSED'}
      </Text>

      <Text
        font="display"
        size={54}
        style={{
          color: isPaused ? theme.textMuted : theme.text,
          lineHeight: 58,
          fontVariant: ['tabular-nums'],
        }}
      >
        {formatClock(seconds)}
      </Text>

      {hasDistance ? (
        <Text font="mono" size={13} style={{ color: theme.gradientFrom, letterSpacing: 1 }}>
          {distanceLabel}
          {paceLabel ? ` · ${paceLabel}` : ''}
        </Text>
      ) : (
        <Text font="body" size={12} color="muted">
          Log your distance when you finish
        </Text>
      )}
    </View>
  );
}

/** h:mm:ss once past an hour, m:ss below it — a 25-minute run should not read "00:25:00". */
function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  return hours > 0 ? `${hours}:${mm}:${String(secs).padStart(2, '0')}` : `${mm}:${String(secs).padStart(2, '0')}`;
}

function formatPace(seconds: number, meters: number, unit: UnitPreference): string {
  if (meters <= 0) return '';
  const perUnit = unit === 'lb' ? seconds / (meters / 1609.344) : seconds / (meters / 1000);
  const mins = Math.floor(perUnit / 60);
  const secs = Math.round(perUnit % 60);
  // 9:60 is not a time — carry it.
  const carried = secs === 60 ? { m: mins + 1, s: 0 } : { m: mins, s: secs };
  return `${carried.m}:${String(carried.s).padStart(2, '0')} /${unit === 'lb' ? 'mi' : 'km'}`;
}

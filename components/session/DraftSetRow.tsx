import { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { SetInputAdjuster } from './SetInputAdjuster';
import { RpeSlider } from './RpeSlider';
import { useLogSet } from '@/hooks/useLoggedSets';
import { useLastSessionSets } from '@/hooks/useLastSessionSets';
import { displayWeight, toStoredKg } from '@/lib/utils/units';
import type { Exercise, LoggedSet } from '@/types/domain';
import type { SetType, UnitPreference } from '@/types/database.types';

const SET_TYPES: SetType[] = ['working', 'warmup', 'drop', 'failure'];

interface Draft {
  weightKg: number | null;
  reps: number | null;
  timeSeconds: number | null;
  distanceMeters: number | null;
  setType: SetType;
  rpe: number | null;
}

const emptyDraft: Draft = { weightKg: null, reps: null, timeSeconds: null, distanceMeters: null, setType: 'working', rpe: null };

function draftFromSet(set: LoggedSet | undefined): Draft {
  if (!set) return emptyDraft;
  return {
    weightKg: set.weight,
    reps: set.reps,
    timeSeconds: set.time_seconds,
    distanceMeters: set.distance_meters,
    setType: 'working', // never pre-fill a warmup/drop/failure tag onto a new set — only the numbers
    rpe: null,
  };
}

export function DraftSetRow({
  exercise,
  sessionExerciseId,
  sessionId,
  currentSets,
  restSeconds,
  unit,
  onStartRest,
  progressionDeltaKg,
}: {
  exercise: Exercise;
  sessionExerciseId: string;
  sessionId: string;
  currentSets: LoggedSet[];
  restSeconds: number;
  unit: UnitPreference;
  onStartRest: (seconds: number) => void;
  progressionDeltaKg: number | null;
}) {
  const theme = useTheme();
  const logSet = useLogSet();
  const { data: lastSession } = useLastSessionSets(exercise.id);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [rpeExpanded, setRpeExpanded] = useState(false);

  const nextIndex = currentSets.length;

  // Re-derive the pre-fill whenever we advance to a new set index: match last session's set at the same
  // index, falling back to its final set if this session already has more sets than last time.
  useEffect(() => {
    const lastSets = lastSession?.sets ?? [];
    const matching = lastSets[nextIndex] ?? lastSets[lastSets.length - 1];
    let next = draftFromSet(matching);
    if (progressionDeltaKg != null && next.weightKg != null) {
      next = { ...next, weightKg: next.weightKg + progressionDeltaKg };
    }
    setDraft(next);
    setRpeExpanded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextIndex, lastSession, progressionDeltaKg]);

  async function handleComplete() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await logSet.mutateAsync({
      sessionExerciseId,
      sessionId,
      exerciseId: exercise.id,
      setIndex: nextIndex,
      setType: draft.setType,
      weight: draft.weightKg,
      reps: draft.reps,
      timeSeconds: draft.timeSeconds,
      distanceMeters: draft.distanceMeters,
      rpe: draft.rpe,
    });
    if (draft.setType !== 'warmup') onStartRest(restSeconds);
  }

  const trackingType = exercise.tracking_type;
  const displayWeightValue = displayWeight(draft.weightKg, unit);

  return (
    <View style={{ gap: spacing.sm, backgroundColor: theme.cardInset, borderRadius: radius.md, padding: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        {SET_TYPES.map((type) => (
          <Pressable
            key={type}
            onPress={() => setDraft((d) => ({ ...d, setType: type }))}
            style={{
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
              borderRadius: radius.full,
              backgroundColor: draft.setType === type ? theme.primary : theme.surface,
            }}
          >
            <Text font="body" weight="600" size={11} style={{ color: draft.setType === type ? theme.onAccent : theme.text }}>
              {type}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
          {trackingType === 'weight_reps' && (
            <>
              <SetInputAdjuster
                label="Weight"
                unit={unit}
                value={displayWeightValue}
                step={unit === 'lb' ? 5 : 2.5}
                decimals={1}
                onChange={(v) => setDraft((d) => ({ ...d, weightKg: v == null ? null : toStoredKg(v, unit) }))}
              />
              <SetInputAdjuster label="Reps" value={draft.reps} step={1} onChange={(v) => setDraft((d) => ({ ...d, reps: v }))} />
            </>
          )}
          {trackingType === 'bodyweight_reps' && (
            <SetInputAdjuster label="Reps" value={draft.reps} step={1} onChange={(v) => setDraft((d) => ({ ...d, reps: v }))} />
          )}
          {trackingType === 'time' && (
            <SetInputAdjuster label="Seconds" value={draft.timeSeconds} step={5} onChange={(v) => setDraft((d) => ({ ...d, timeSeconds: v }))} />
          )}
          {trackingType === 'distance' && (
            <SetInputAdjuster label="Meters" value={draft.distanceMeters} step={50} onChange={(v) => setDraft((d) => ({ ...d, distanceMeters: v }))} />
          )}
          {trackingType === 'distance_duration' && (
            <>
              <SetInputAdjuster label="Meters" value={draft.distanceMeters} step={100} onChange={(v) => setDraft((d) => ({ ...d, distanceMeters: v }))} />
              <SetInputAdjuster label="Seconds" value={draft.timeSeconds} step={15} onChange={(v) => setDraft((d) => ({ ...d, timeSeconds: v }))} />
            </>
          )}
        </View>

        <Pressable
          onPress={handleComplete}
          disabled={logSet.isPending}
          accessibilityRole="button"
          accessibilityLabel="Log set"
          style={{
            width: 44,
            height: 44,
            borderRadius: radius.full,
            backgroundColor: theme.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: logSet.isPending ? 0.6 : 1,
          }}
        >
          <Text style={{ fontSize: 20, color: theme.onAccent, fontWeight: '700' }}>✓</Text>
        </Pressable>
      </View>

      {rpeExpanded ? (
        <RpeSlider value={draft.rpe} onChange={(v) => setDraft((d) => ({ ...d, rpe: v }))} />
      ) : (
        <Pressable onPress={() => setRpeExpanded(true)}>
          <Text font="body" weight="600" size={12} color="muted">
            + Add RPE
          </Text>
        </Pressable>
      )}
    </View>
  );
}

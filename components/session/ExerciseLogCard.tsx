import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { SetRow } from './SetRow';
import { SetInputAdjuster } from './SetInputAdjuster';
import { RpeSlider } from './RpeSlider';
import { useLogSet, useUpdateLoggedSet, useDeleteLoggedSet } from '@/hooks/useLoggedSets';
import { useLastSetForExercise } from '@/hooks/useWorkoutSession';
import { useTheme, spacing, radius } from '@/lib/theme';
import type { SessionExerciseWithSets } from '@/types/domain';
import type { SetType } from '@/types/database.types';

const SET_TYPES: SetType[] = ['working', 'warmup', 'drop', 'failure'];
const DEFAULT_REST_SECONDS = 90;

interface Draft {
  weight: number | null;
  reps: number | null;
  timeSeconds: number | null;
  distanceMeters: number | null;
  setType: SetType;
  rpe: number | null;
}

const emptyDraft: Draft = { weight: null, reps: null, timeSeconds: null, distanceMeters: null, setType: 'working', rpe: null };

export function ExerciseLogCard({
  sessionExercise,
  sessionId,
  onStartRest,
}: {
  sessionExercise: SessionExerciseWithSets;
  sessionId: string;
  onStartRest: (seconds: number) => void;
}) {
  const theme = useTheme();
  const { exercise, sets } = sessionExercise;
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);

  const { data: lastSet } = useLastSetForExercise(exercise.id);
  const logSet = useLogSet();
  const updateSet = useUpdateLoggedSet();
  const deleteSet = useDeleteLoggedSet();

  function loadDraftFromSet(setId: string) {
    const target = sets.find((s) => s.id === setId);
    if (!target) return;
    setDraft({
      weight: target.weight,
      reps: target.reps,
      timeSeconds: target.time_seconds,
      distanceMeters: target.distance_meters,
      setType: target.set_type,
      rpe: target.rpe,
    });
    setEditingSetId(setId);
  }

  async function handleSubmit() {
    if (editingSetId) {
      await updateSet.mutateAsync({
        id: editingSetId,
        sessionId,
        patch: {
          weight: draft.weight,
          reps: draft.reps,
          time_seconds: draft.timeSeconds,
          distance_meters: draft.distanceMeters,
          rpe: draft.rpe,
          set_type: draft.setType,
        },
      });
      setEditingSetId(null);
    } else {
      await logSet.mutateAsync({
        sessionExerciseId: sessionExercise.id,
        sessionId,
        setIndex: sets.length,
        setType: draft.setType,
        weight: draft.weight,
        reps: draft.reps,
        timeSeconds: draft.timeSeconds,
        distanceMeters: draft.distanceMeters,
        rpe: draft.rpe,
      });
      if (draft.setType !== 'warmup') {
        onStartRest(sessionExercise.rest_seconds ?? DEFAULT_REST_SECONDS);
      }
    }
    setDraft(emptyDraft);
  }

  const trackingType = exercise.tracking_type;

  return (
    <Card style={{ gap: spacing.md }}>
      <View>
        <Text weight="700" variant="subtitle">
          {exercise.name}
        </Text>
        {lastSet ? (
          <Text variant="caption" color="muted">
            Last time: {lastSet.weight ?? 0}kg × {lastSet.reps ?? 0}
          </Text>
        ) : (
          <Text variant="caption" color="muted">
            First time logging this exercise
          </Text>
        )}
      </View>

      {sets.length > 0 ? (
        <View>
          {sets.map((set, idx) => (
            <SetRow
              key={set.id}
              set={set}
              index={idx}
              trackingType={trackingType}
              onEdit={() => loadDraftFromSet(set.id)}
              onDelete={() => deleteSet.mutate({ id: set.id, sessionId })}
            />
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        {SET_TYPES.map((type) => (
          <Pressable
            key={type}
            onPress={() => setDraft((d) => ({ ...d, setType: type }))}
            style={{
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
              borderRadius: radius.full,
              backgroundColor: draft.setType === type ? theme.primary : theme.surfaceAlt,
            }}
          >
            <Text variant="caption" weight="600" style={{ color: draft.setType === type ? '#FFF' : theme.text }}>
              {type}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {trackingType === 'weight_reps' && (
          <>
            <SetInputAdjuster label="Weight (kg)" value={draft.weight} step={2.5} decimals={1} onChange={(v) => setDraft((d) => ({ ...d, weight: v }))} />
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
      </View>

      <RpeSlider value={draft.rpe} onChange={(v) => setDraft((d) => ({ ...d, rpe: v }))} />

      <Button
        label={editingSetId ? 'Update Set' : 'Log Set'}
        onPress={handleSubmit}
        loading={logSet.isPending || updateSet.isPending}
        fullWidth
      />
      {editingSetId ? (
        <Button
          label="Cancel Edit"
          variant="ghost"
          onPress={() => {
            setEditingSetId(null);
            setDraft(emptyDraft);
          }}
          fullWidth
        />
      ) : null}
    </Card>
  );
}

import { useState } from 'react';
import { View } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SetRow } from './SetRow';
import { SetInputAdjuster } from './SetInputAdjuster';
import { RpeSlider } from './RpeSlider';
import { ExerciseCardHeader } from './ExerciseCardHeader';
import { LastSessionRow } from './LastSessionRow';
import { ProgressionChip } from './ProgressionChip';
import { DraftSetRow } from './DraftSetRow';
import { PrBadge } from './PrBadge';
import { useUpdateLoggedSet, useDeleteLoggedSet } from '@/hooks/useLoggedSets';
import { displayWeight, toStoredKg } from '@/lib/utils/units';
import { spacing } from '@/lib/theme';
import type { SessionExerciseWithSets } from '@/types/domain';
import type { UnitPreference } from '@/types/database.types';

const DEFAULT_REST_SECONDS = 90;

export function ExerciseLogCard({
  sessionExercise,
  sessionId,
  unit,
  onStartRest,
  onRemove,
  onRequestSwap,
}: {
  sessionExercise: SessionExerciseWithSets;
  sessionId: string;
  unit: UnitPreference;
  onStartRest: (seconds: number) => void;
  onRemove: () => void;
  onRequestSwap: () => void;
}) {
  const { exercise, sets } = sessionExercise;
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editWeightKg, setEditWeightKg] = useState<number | null>(null);
  const [editReps, setEditReps] = useState<number | null>(null);
  const [editRpe, setEditRpe] = useState<number | null>(null);
  const [acceptedDeltaKg, setAcceptedDeltaKg] = useState<number | null>(null);

  const updateSet = useUpdateLoggedSet();
  const deleteSet = useDeleteLoggedSet();

  const hasLoggedSets = sets.length > 0;

  function startEditing(setId: string) {
    const target = sets.find((s) => s.id === setId);
    if (!target) return;
    setEditWeightKg(target.weight);
    setEditReps(target.reps);
    setEditRpe(target.rpe);
    setEditingSetId(setId);
  }

  async function saveEdit() {
    if (!editingSetId) return;
    await updateSet.mutateAsync({
      id: editingSetId,
      sessionId,
      patch: { weight: editWeightKg, reps: editReps, rpe: editRpe },
    });
    setEditingSetId(null);
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <ExerciseCardHeader exercise={exercise} onRemove={onRemove} onSwap={onRequestSwap} removeDisabled={hasLoggedSets} />
      <LastSessionRow exerciseId={exercise.id} trackingType={exercise.tracking_type} />
      <PrBadge sets={sets} exerciseName={exercise.name} />

      {sets.length > 0 ? (
        <View>
          {sets.map((set, idx) =>
            editingSetId === set.id ? (
              <View key={set.id} style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                  <SetInputAdjuster
                    label="Weight"
                    unit={unit}
                    value={displayWeight(editWeightKg, unit)}
                    step={unit === 'lb' ? 5 : 2.5}
                    decimals={1}
                    onChange={(v) => setEditWeightKg(v == null ? null : toStoredKg(v, unit))}
                  />
                  <SetInputAdjuster label="Reps" value={editReps} step={1} onChange={setEditReps} />
                </View>
                <RpeSlider value={editRpe} onChange={setEditRpe} />
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button label="Cancel" variant="ghost" onPress={() => setEditingSetId(null)} fullWidth />
                  <Button label="Save" onPress={saveEdit} loading={updateSet.isPending} fullWidth />
                </View>
              </View>
            ) : (
              <SetRow
                key={set.id}
                set={set}
                index={idx}
                trackingType={exercise.tracking_type}
                onEdit={() => startEditing(set.id)}
                onDelete={() => deleteSet.mutate({ id: set.id, sessionId })}
              />
            ),
          )}
        </View>
      ) : null}

      <ProgressionChip exercise={exercise} sessionExercise={sessionExercise} onAccept={setAcceptedDeltaKg} />

      <DraftSetRow
        exercise={exercise}
        sessionExerciseId={sessionExercise.id}
        sessionId={sessionId}
        currentSets={sets}
        restSeconds={sessionExercise.rest_seconds ?? DEFAULT_REST_SECONDS}
        unit={unit}
        onStartRest={onStartRest}
        progressionDeltaKg={acceptedDeltaKg}
      />
    </Card>
  );
}

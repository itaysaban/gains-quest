import { useState } from 'react';
import { View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { RoutineExerciseRow } from '@/components/routine/RoutineExerciseRow';
import { ExercisePicker } from '@/components/exercise/ExercisePicker';
import {
  useRoutine,
  useRoutineExercises,
  useAddExerciseToRoutine,
  useUpdateRoutineExercise,
  useReorderRoutineExercises,
  useRemoveRoutineExercise,
  useDuplicateRoutine,
  useUpdateRoutine,
} from '@/hooks/useRoutines';
import { useStartSession } from '@/hooks/useWorkoutSession';
import { generateUuid } from '@/lib/utils/uuid';
import { spacing } from '@/lib/theme';
import type { RoutineExerciseWithDetails } from '@/types/domain';

export default function RoutineDetail() {
  const { routineId } = useLocalSearchParams<{ routineId: string }>();
  const router = useRouter();
  const { data: routine, isLoading: loadingRoutine } = useRoutine(routineId);
  const { data: routineExercises, isLoading: loadingExercises } = useRoutineExercises(routineId);
  const addExercise = useAddExerciseToRoutine();
  const updateExercise = useUpdateRoutineExercise();
  const reorderExercises = useReorderRoutineExercises();
  const removeExercise = useRemoveRoutineExercise();
  const duplicateRoutine = useDuplicateRoutine();
  const updateRoutine = useUpdateRoutine();
  const startSession = useStartSession();

  const [pickerVisible, setPickerVisible] = useState(false);
  const [localOrder, setLocalOrder] = useState<RoutineExerciseWithDetails[] | null>(null);

  const items = localOrder ?? routineExercises ?? [];

  if (loadingRoutine || loadingExercises || !routine) return <LoadingState />;

  function isLinkedToPrevious(idx: number) {
    if (idx === 0) return false;
    const prev = items[idx - 1];
    const cur = items[idx];
    return !!cur.superset_group_id && cur.superset_group_id === prev.superset_group_id;
  }

  async function handleToggleSuperset(idx: number) {
    if (idx === 0) return;
    const prev = items[idx - 1];
    const cur = items[idx];

    if (isLinkedToPrevious(idx)) {
      await updateExercise.mutateAsync({ id: cur.id, routineId: routineId!, patch: { superset_group_id: null } });
      return;
    }

    const groupId = prev.superset_group_id ?? generateUuid();
    if (!prev.superset_group_id) {
      await updateExercise.mutateAsync({ id: prev.id, routineId: routineId!, patch: { superset_group_id: groupId } });
    }
    await updateExercise.mutateAsync({ id: cur.id, routineId: routineId!, patch: { superset_group_id: groupId } });
  }

  async function handleStartWorkout() {
    const newSession = await startSession.mutateAsync({ routineId: routineId!, routineExercises: items });
    void newSession;
    router.push('/session/active');
  }

  async function handleDuplicate() {
    const newId = await duplicateRoutine.mutateAsync({ routineId: routineId! });
    router.replace(`/(tabs)/add-workout/routines/${newId}`);
  }

  return (
    <>
      <Screen padded={false}>
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs }}>
          <Text variant="title">{routine.name}</Text>
          {routine.description ? <Text color="muted">{routine.description}</Text> : null}
        </View>

        {items.length === 0 ? (
          <EmptyState
            icon="add-circle-outline"
            title="No exercises in this routine yet"
            message="Add exercises to build your template."
            actionLabel="Add Exercise"
            onAction={() => setPickerVisible(true)}
          />
        ) : (
          <DraggableFlatList
            data={items}
            keyExtractor={(item) => item.id}
            containerStyle={{ flex: 1 }}
            contentContainerStyle={{ padding: spacing.lg }}
            onDragEnd={({ data }) => {
              setLocalOrder(data);
              reorderExercises.mutate({
                routineId: routineId!,
                ordered: data.map((item, idx) => ({ id: item.id, order_index: idx })),
              });
            }}
            renderItem={({ item, drag, getIndex }: RenderItemParams<RoutineExerciseWithDetails>) => {
              const idx = getIndex() ?? 0;
              return (
                <ScaleDecorator>
                  <RoutineExerciseRow
                    item={item}
                    isSupersetLinked={isLinkedToPrevious(idx)}
                    onDrag={drag}
                    onRemove={() => removeExercise.mutate({ id: item.id, routineId: routineId! })}
                    onToggleSuperset={() => handleToggleSuperset(idx)}
                    onPatch={(patch) => updateExercise.mutate({ id: item.id, routineId: routineId!, patch })}
                  />
                </ScaleDecorator>
              );
            }}
          />
        )}

        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          <Button label="+ Add Exercise" variant="secondary" onPress={() => setPickerVisible(true)} fullWidth />
          <Button label="Start Workout" onPress={handleStartWorkout} loading={startSession.isPending} fullWidth />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Schedule" variant="secondary" onPress={() => router.push(`/(tabs)/add-workout/routines/${routineId}/schedule`)} fullWidth />
            <Button label="Duplicate" variant="secondary" onPress={handleDuplicate} fullWidth />
          </View>
          <Button
            label={routine.is_archived ? 'Unarchive Routine' : 'Archive Routine'}
            variant="ghost"
            onPress={() => updateRoutine.mutate({ id: routineId!, patch: { is_archived: !routine.is_archived } })}
            fullWidth
          />
        </View>
      </Screen>

      <ExercisePicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(exercise) => {
          setLocalOrder(null);
          addExercise.mutate({ routineId: routineId!, exerciseId: exercise.id, orderIndex: items.length });
        }}
      />
    </>
  );
}

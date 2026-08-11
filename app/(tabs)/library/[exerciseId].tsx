import { useState } from 'react';
import { View, Alert, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/LoadingState';
import { ExerciseForm } from '@/components/exercise/ExerciseForm';
import {
  useExercise,
  useUpdateExercise,
  useCloneExercise,
  useArchiveExercise,
  useDeleteExercise,
  useToggleFavoriteExercise,
} from '@/hooks/useExercises';
import { spacing } from '@/lib/theme';
import { useTheme } from '@/lib/theme';
import type { ExerciseFormValues } from '@/lib/utils/validation/exercise';

export default function ExerciseDetail() {
  const { exerciseId } = useLocalSearchParams<{ exerciseId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { data: exercise, isLoading } = useExercise(exerciseId);
  const updateExercise = useUpdateExercise();
  const cloneExercise = useCloneExercise();
  const archiveExercise = useArchiveExercise();
  const deleteExercise = useDeleteExercise();
  const toggleFavorite = useToggleFavoriteExercise();
  const [editing, setEditing] = useState(false);

  if (isLoading || !exercise) return <LoadingState />;

  async function handleUpdate(values: ExerciseFormValues) {
    await updateExercise.mutateAsync({
      id: exercise!.id,
      patch: {
        name: values.name,
        category: values.category,
        muscle_groups: values.muscleGroups,
        equipment: values.equipment,
        tracking_type: values.trackingType,
        notes: values.notes || null,
        custom_fields: values.customFields,
      },
    });
    setEditing(false);
  }

  function handleDelete() {
    Alert.alert('Delete exercise?', 'This is only possible if it has no logged history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteExercise.mutateAsync(exercise!.id);
            router.back();
          } catch (e: any) {
            Alert.alert(
              'Cannot delete',
              'This exercise has logged workout history. Archive it instead to hide it from pickers.',
            );
          }
        },
      },
    ]);
  }

  if (editing) {
    return (
      <Screen scroll>
        <ExerciseForm
          submitLabel="Save Changes"
          submitting={updateExercise.isPending}
          defaultValues={{
            name: exercise.name,
            category: exercise.category,
            muscleGroups: exercise.muscle_groups,
            equipment: exercise.equipment,
            trackingType: exercise.tracking_type,
            notes: exercise.notes ?? '',
            customFields: exercise.custom_fields,
          }}
          onSubmit={handleUpdate}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text variant="title">{exercise.name}</Text>
            <Text color="muted">
              {exercise.category} · {exercise.equipment} · {exercise.tracking_type.replace('_', ' ')}
            </Text>
          </View>
          <Pressable
            onPress={() => toggleFavorite.mutate({ id: exercise.id, isFavorite: !exercise.is_favorite })}
            hitSlop={8}
          >
            <Ionicons name={exercise.is_favorite ? 'star' : 'star-outline'} size={26} color={theme.warning} />
          </Pressable>
        </View>

        {exercise.muscle_groups.length > 0 ? (
          <Card>
            <Text variant="label" color="muted" weight="600">
              MUSCLE GROUPS
            </Text>
            <Text>{exercise.muscle_groups.join(', ')}</Text>
          </Card>
        ) : null}

        {exercise.notes ? (
          <Card>
            <Text variant="label" color="muted" weight="600">
              NOTES
            </Text>
            <Text>{exercise.notes}</Text>
          </Card>
        ) : null}

        {exercise.custom_fields.length > 0 ? (
          <Card>
            <Text variant="label" color="muted" weight="600">
              CUSTOM FIELDS
            </Text>
            {exercise.custom_fields.map((f) => (
              <Text key={f.key}>
                {f.label} ({f.type})
              </Text>
            ))}
          </Card>
        ) : null}

        <Button label="View Progress Chart" variant="secondary" onPress={() => router.push(`/(tabs)/progress/${exercise.id}/chart`)} fullWidth />

        {!exercise.is_system ? (
          <View style={{ gap: spacing.sm }}>
            <Button label="Edit" onPress={() => setEditing(true)} fullWidth />
            <Button
              label="Duplicate as Variation"
              variant="secondary"
              onPress={() => cloneExercise.mutate(exercise)}
              fullWidth
            />
            <Button
              label={exercise.is_archived ? 'Unarchive' : 'Archive'}
              variant="secondary"
              onPress={() => archiveExercise.mutate({ id: exercise.id, archived: !exercise.is_archived })}
              fullWidth
            />
            <Button label="Delete" variant="danger" onPress={handleDelete} fullWidth />
          </View>
        ) : (
          <Button label="Duplicate as Custom Variation" variant="secondary" onPress={() => cloneExercise.mutate(exercise)} fullWidth />
        )}
      </View>
    </Screen>
  );
}

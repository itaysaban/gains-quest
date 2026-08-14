import { useState } from 'react';
import { Modal, View, FlatList, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, spacing } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { EmptyState } from '@/components/ui/EmptyState';
import { ExerciseForm } from '@/components/exercise/ExerciseForm';
import { useExercises, useCreateExercise, useCheckDuplicateExerciseName, useRecentlyUsedExercises } from '@/hooks/useExercises';
import { useAuth } from '@/lib/auth/AuthProvider';
import { splitMuscleGroups, TRACKING_TYPE_LABELS } from '@/lib/utils/exercise';
import type { Exercise } from '@/types/domain';
import type { ExerciseFormValues } from '@/lib/utils/validation/exercise';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
  title?: string;
}

export function ExercisePicker({ visible, onClose, onSelect, title = 'Add Exercise' }: Props) {
  const theme = useTheme();
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data: exercises, isLoading } = useExercises({ search: search || undefined });
  const { data: recentlyUsed } = useRecentlyUsedExercises();
  const createExercise = useCreateExercise();
  const checkDuplicate = useCheckDuplicateExerciseName();

  function reset() {
    setCreating(false);
    setSearch('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  // A newly created exercise is just a normal row in `exercises` (user_id set, is_system false) —
  // the same table every picker/library screen reads from, so it's immediately reusable everywhere,
  // not just added to whatever routine/session is currently being built.
  async function handleCreate(values: ExerciseFormValues) {
    if (!session) return;
    setSubmitting(true);
    try {
      const duplicates = await checkDuplicate.mutateAsync({ name: values.name, userId: session.user.id });
      if (duplicates.length > 0) {
        Alert.alert(
          'Similar exercise exists',
          `You already have "${duplicates[0].name}". Create anyway?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setSubmitting(false) },
            {
              text: 'Create Anyway',
              onPress: async () => {
                const exercise = await createExercise.mutateAsync(values);
                onSelect(exercise);
                handleClose();
              },
            },
          ],
        );
        return;
      }
      const exercise = await createExercise.mutateAsync(values);
      onSelect(exercise);
      handleClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: spacing.xl }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
            marginBottom: spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {creating ? (
              <Pressable onPress={() => setCreating(false)} hitSlop={8}>
                <Ionicons name="chevron-back" size={24} color={theme.text} />
              </Pressable>
            ) : null}
            <Text variant="subtitle">{creating ? 'New Exercise' : title}</Text>
          </View>
          <Pressable onPress={handleClose} hitSlop={8}>
            <Ionicons name="close" size={26} color={theme.text} />
          </Pressable>
        </View>

        {creating ? (
          <View style={{ flex: 1, paddingHorizontal: spacing.lg }}>
            <ExerciseForm
              defaultValues={{ name: search }}
              onSubmit={handleCreate}
              submitting={submitting}
              submitLabel="Create & Add"
            />
          </View>
        ) : (
          <>
            <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md, gap: spacing.sm }}>
              <TextField placeholder="Search exercises…" value={search} onChangeText={setSearch} autoCapitalize="none" />
              <Pressable
                onPress={() => setCreating(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs }}
              >
                <Ionicons name="add-circle" size={20} color={theme.primary} />
                <Text color="primary" weight="600">
                  {search ? `Create "${search}" as a new exercise` : 'Create a new exercise'}
                </Text>
              </Pressable>
            </View>

            {!isLoading && exercises?.length === 0 ? (
              <EmptyState
                icon="search"
                title="No exercises found"
                message="Try a different search term, or create it as a new exercise."
                actionLabel="Create New Exercise"
                onAction={() => setCreating(true)}
              />
            ) : (
              <FlatList
                data={exercises}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
                ListHeaderComponent={
                  !search && recentlyUsed && recentlyUsed.length > 0 ? (
                    <View style={{ marginBottom: spacing.md }}>
                      <Text variant="label" color="muted" weight="700" style={{ marginBottom: spacing.xs }}>
                        RECENTLY USED
                      </Text>
                      <FlatList
                        horizontal
                        data={recentlyUsed}
                        keyExtractor={(item) => `recent-${item.id}`}
                        showsHorizontalScrollIndicator={false}
                        ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
                        renderItem={({ item }) => (
                          <Pressable
                            onPress={() => {
                              onSelect(item);
                              handleClose();
                            }}
                            style={{
                              backgroundColor: theme.surfaceAlt,
                              borderRadius: 12,
                              paddingHorizontal: spacing.md,
                              paddingVertical: spacing.sm,
                            }}
                          >
                            <Text weight="600">{item.name}</Text>
                          </Pressable>
                        )}
                      />
                    </View>
                  ) : null
                }
                renderItem={({ item }) => {
                  const { primary, secondary } = splitMuscleGroups(item.muscle_groups);
                  return (
                    <Pressable
                      onPress={() => {
                        onSelect(item);
                        handleClose();
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: spacing.md,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.border,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text weight="600">{item.name}</Text>
                        <Text variant="caption" color="muted">
                          {primary ?? item.category}
                          {secondary.length > 0 ? ` (+ ${secondary.join(', ')})` : ''} · {item.equipment} ·{' '}
                          {TRACKING_TYPE_LABELS[item.tracking_type]}
                        </Text>
                      </View>
                      {item.is_favorite ? <Ionicons name="star" size={18} color={theme.warning} /> : null}
                    </Pressable>
                  );
                }}
              />
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

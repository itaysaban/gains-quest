import { useState } from 'react';
import { Modal, View, TextInput, FlatList, Pressable, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, spacing, radius } from '@/lib/theme';
import { Text } from '@/components/ui/Text';
import { EmptyState } from '@/components/ui/EmptyState';
import { ExerciseForm } from '@/components/exercise/ExerciseForm';
import { useExercises, useCreateExercise, useCheckDuplicateExerciseName, useRecentlyUsedExercises } from '@/hooks/useExercises';
import { useAuth } from '@/lib/auth/AuthProvider';
import { splitMuscleGroups, TRACKING_TYPE_LABELS } from '@/lib/utils/exercise';
import type { Exercise } from '@/types/domain';
import type { ExerciseCategory } from '@/types/database.types';
import type { ExerciseFormValues } from '@/lib/utils/validation/exercise';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (exercise: Exercise) => void;
  title?: string;
}

const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  core: 'Core',
  cardio: 'Cardio',
};
const CATEGORIES = Object.keys(CATEGORY_LABEL) as ExerciseCategory[];

/** Exercise Picker — design handoff §6 / PRD §6.1.1. Filter chips use the app's real `category`
 * taxonomy (push/pull/legs/core/cardio, already a queryable useExercises filter) rather than the
 * mockup's muscle-group labels (Chest/Back/...) — those aren't a real filterable column here.
 * Single-select preserved (tap a row, it's added and the sheet closes) rather than the mockup's
 * multi-select "Add N exercises" footer — that's a real interaction-model change across the 3
 * screens this component is embedded in, not a visual-only one; not taken on unsupervised. */
export function ExercisePicker({ visible, onClose, onSelect, title = 'Add Exercise' }: Props) {
  const theme = useTheme();
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ExerciseCategory | null>(null);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { data: exercises, isLoading } = useExercises({ search: search || undefined, category: category ?? undefined });
  const { data: recentlyUsed } = useRecentlyUsedExercises();
  const createExercise = useCreateExercise();
  const checkDuplicate = useCheckDuplicateExerciseName();

  function reset() {
    setCreating(false);
    setSearch('');
    setCategory(null);
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
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ backgroundColor: theme.chrome, paddingTop: spacing.xl, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            {creating ? (
              <Pressable onPress={() => setCreating(false)} hitSlop={8}>
                <Text font="body" weight="700" size={20} color="secondary">
                  ‹
                </Text>
              </Pressable>
            ) : null}
            <Text font="body" weight="700" size={17} style={{ flex: 1 }}>
              {creating ? 'New Exercise' : title}
            </Text>
            {!creating ? (
              <Pressable onPress={() => setCreating(true)}>
                <Text font="body" weight="600" size={13} color="primary">
                  Custom
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={handleClose} hitSlop={8}>
              <Text font="body" weight="700" size={20} color="secondary">
                ✕
              </Text>
            </Pressable>
          </View>

          {!creating ? (
            <View
              style={{
                // cardInset, not background — this field sits on the picker's own ground, which is
                // now black, so `background` here would make the field invisible.
                backgroundColor: theme.cardInset,
                borderRadius: radius.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
              }}
            >
              <Text style={{ fontSize: 14, color: theme.textMuted }}>⌕</Text>
              <TextInput
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                placeholder="Search exercises…"
                placeholderTextColor={theme.textMuted}
                style={{ flex: 1, fontSize: 14, color: theme.text }}
              />
            </View>
          ) : null}
        </View>

        {creating ? (
          <View style={{ flex: 1, padding: spacing.lg }}>
            <ExerciseForm defaultValues={{ name: search }} onSubmit={handleCreate} submitting={submitting} submitLabel="Create & Add" />
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, padding: spacing.lg, paddingBottom: spacing.md }}>
              {CATEGORIES.map((c) => {
                const active = category === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(active ? null : c)}
                    style={{
                      paddingHorizontal: spacing.md,
                      paddingVertical: spacing.sm,
                      borderRadius: radius.full,
                      backgroundColor: active ? theme.primary : theme.surface,
                    }}
                  >
                    <Text font="body" weight="600" size={12} style={{ color: active ? theme.onAccent : theme.textSecondary }}>
                      {CATEGORY_LABEL[c]}
                    </Text>
                  </Pressable>
                );
              })}
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
                contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xs }}
                ListHeaderComponent={
                  !search && !category && recentlyUsed && recentlyUsed.length > 0 ? (
                    <View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
                      <Text font="mono" size={12} color="muted" style={{ letterSpacing: 1.5 }}>
                        RECENT
                      </Text>
                      {recentlyUsed.map((item) => (
                        <ExerciseRow key={`recent-${item.id}`} exercise={item} onPress={() => { onSelect(item); handleClose(); }} />
                      ))}
                      <Text font="mono" size={12} color="muted" style={{ letterSpacing: 1.5, marginTop: spacing.xs }}>
                        ALL
                      </Text>
                    </View>
                  ) : null
                }
                renderItem={({ item }) => <ExerciseRow exercise={item} onPress={() => { onSelect(item); handleClose(); }} />}
                ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
                ListFooterComponent={
                  <Pressable
                    onPress={() => setCreating(true)}
                    style={{
                      marginTop: spacing.sm,
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: theme.borderSubtle,
                      borderRadius: radius.md,
                      padding: spacing.md,
                      alignItems: 'center',
                    }}
                  >
                    <Text font="body" weight="600" size={13} color="secondary">
                      Can&apos;t find it? Create a custom exercise
                    </Text>
                  </Pressable>
                }
              />
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

function ExerciseRow({ exercise, onPress }: { exercise: Exercise; onPress: () => void }) {
  const theme = useTheme();
  const { primary, secondary } = splitMuscleGroups(exercise.muscle_groups);

  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: theme.surface, borderRadius: radius.md, padding: spacing.md }}
    >
      <View style={{ width: 34, height: 34, borderRadius: radius.sm, backgroundColor: theme.cardInset }} />
      <View style={{ flex: 1 }}>
        <Text font="body" weight="700" size={15} style={{ lineHeight: 16 }}>
          {exercise.name}
        </Text>
        <Text font="body" size={11} color="muted" style={{ lineHeight: 14, marginTop: 1 }}>
          {primary ?? exercise.category}
          {secondary.length > 0 ? ` (+ ${secondary.join(', ')})` : ''} · {exercise.equipment} · {TRACKING_TYPE_LABELS[exercise.tracking_type]}
        </Text>
      </View>
      {exercise.is_favorite ? <Text style={{ fontSize: 16, color: theme.warning }}>★</Text> : null}
      <LinearGradient
        colors={[theme.gradientFrom, theme.gradientTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: 26, height: 26, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ color: theme.onAccent, fontSize: 15, fontWeight: '700', lineHeight: 16 }}>＋</Text>
      </LinearGradient>
    </Pressable>
  );
}

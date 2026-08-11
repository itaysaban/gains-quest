import { View, Pressable, ScrollView } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { CustomFieldEditor } from './CustomFieldEditor';
import { useTheme, spacing, radius } from '@/lib/theme';
import { exerciseFormSchema, type ExerciseFormValues } from '@/lib/utils/validation/exercise';
import type { ExerciseCategory, EquipmentType, TrackingType } from '@/types/database.types';

const CATEGORIES: ExerciseCategory[] = ['push', 'pull', 'legs', 'core', 'cardio'];
const EQUIPMENT: EquipmentType[] = ['barbell', 'dumbbell', 'machine', 'bodyweight', 'cable', 'band'];
const TRACKING_TYPES: { value: TrackingType; label: string }[] = [
  { value: 'weight_reps', label: 'Weight × Reps' },
  { value: 'bodyweight_reps', label: 'Bodyweight Reps' },
  { value: 'time', label: 'Time' },
  { value: 'distance', label: 'Distance' },
];
const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'core', 'cardio',
];

interface Props {
  defaultValues?: Partial<ExerciseFormValues>;
  onSubmit: (values: ExerciseFormValues) => void | Promise<void>;
  submitLabel?: string;
  submitting?: boolean;
}

export function ExerciseForm({ defaultValues, onSubmit, submitLabel = 'Save Exercise', submitting }: Props) {
  const theme = useTheme();
  const { control, handleSubmit, watch, setValue, formState } = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseFormSchema),
    defaultValues: {
      name: '',
      category: 'push',
      muscleGroups: [],
      equipment: 'barbell',
      trackingType: 'weight_reps',
      notes: '',
      customFields: [],
      ...defaultValues,
    },
  });

  const muscleGroups = watch('muscleGroups');
  const customFields = watch('customFields');

  function toggleMuscleGroup(group: string) {
    const next = muscleGroups.includes(group) ? muscleGroups.filter((g) => g !== group) : [...muscleGroups, group];
    setValue('muscleGroups', next);
  }

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xxl }}>
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextField
            label="Name"
            placeholder="e.g. Incline Dumbbell Press"
            value={field.value}
            onChangeText={field.onChange}
            error={formState.errors.name?.message}
          />
        )}
      />

      <ChipGroup
        label="Category"
        options={CATEGORIES}
        selected={[watch('category')]}
        onToggle={(v) => setValue('category', v as ExerciseCategory)}
      />

      <ChipGroup label="Equipment" options={EQUIPMENT} selected={[watch('equipment')]} onToggle={(v) => setValue('equipment', v as EquipmentType)} />

      <View style={{ gap: spacing.sm }}>
        <Text variant="label" color="muted" weight="600">
          TRACKING TYPE
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
          {TRACKING_TYPES.map((t) => {
            const active = watch('trackingType') === t.value;
            return (
              <Pressable
                key={t.value}
                onPress={() => setValue('trackingType', t.value)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radius.full,
                  backgroundColor: active ? theme.primary : theme.surfaceAlt,
                }}
              >
                <Text variant="caption" weight="600" style={{ color: active ? '#FFF' : theme.text }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ChipGroup label="Muscle Groups" options={MUSCLE_GROUPS} selected={muscleGroups} onToggle={toggleMuscleGroup} multi />

      <Controller
        control={control}
        name="notes"
        render={({ field }) => (
          <TextField
            label="Notes / Form Cues"
            placeholder="Optional cue reminder…"
            value={field.value}
            onChangeText={field.onChange}
            multiline
            numberOfLines={3}
          />
        )}
      />

      <CustomFieldEditor fields={customFields} onChange={(fields) => setValue('customFields', fields)} />

      <Button label={submitLabel} onPress={handleSubmit(onSubmit)} loading={submitting} fullWidth />
    </ScrollView>
  );
}

function ChipGroup({
  label,
  options,
  selected,
  onToggle,
  multi,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  multi?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="label" color="muted" weight="600">
        {label.toUpperCase()} {multi ? '' : ''}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <Pressable
              key={opt}
              onPress={() => onToggle(opt)}
              style={{
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                borderRadius: radius.full,
                backgroundColor: active ? theme.primary : theme.surfaceAlt,
              }}
            >
              <Text variant="caption" weight="600" style={{ color: active ? '#FFF' : theme.text, textTransform: 'capitalize' }}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

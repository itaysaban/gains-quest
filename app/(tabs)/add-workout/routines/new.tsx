import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { View, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useCreateRoutine, useRoutineFolders } from '@/hooks/useRoutines';
import { routineFormSchema, type RoutineFormValues } from '@/lib/utils/validation/routine';
import { useTheme, spacing, radius } from '@/lib/theme';

/** Routine Builder's name/folder step — design handoff §5 / PRD §6.1.2. The mockup shows name,
 * folder and the exercises list on one screen; this app splits routine creation (name/folder, here)
 * from adding exercises (the next screen, routines/[routineId]/index.tsx) — a real two-step flow
 * already in place, not something to merge into one screen unsupervised. Restyled to match the card
 * language, kept the two-step navigation. */
export default function NewRoutine() {
  const router = useRouter();
  const theme = useTheme();
  const createRoutine = useCreateRoutine();
  const { data: existingFolders } = useRoutineFolders();
  const { control, handleSubmit, formState, watch, setValue } = useForm<RoutineFormValues>({
    resolver: zodResolver(routineFormSchema),
    defaultValues: { name: '', description: '', folder: '' },
  });

  async function onSubmit(values: RoutineFormValues) {
    const routine = await createRoutine.mutateAsync(values);
    router.replace(`/(tabs)/add-workout/routines/${routine.id}`);
  }

  const folder = watch('folder');

  return (
    <Screen scroll padded={false}>
      <View style={{ backgroundColor: theme.chrome, paddingTop: spacing.xl, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text font="body" weight="700" size={20} color="secondary">
            ‹
          </Text>
        </Pressable>
        <Text font="body" weight="700" size={17} style={{ flex: 1, marginLeft: spacing.md }}>
          New routine
        </Text>
        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={createRoutine.isPending}
          style={{ backgroundColor: theme.primary, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
        >
          {createRoutine.isPending ? (
            <ActivityIndicator color={theme.onAccent} size="small" />
          ) : (
            <Text font="body" weight="700" size={13} style={{ color: theme.onAccent }}>
              Save
            </Text>
          )}
        </Pressable>
      </View>

      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.md, gap: 6 }}>
              <Text font="mono" size={10} color="muted" style={{ letterSpacing: 1.5 }}>
                ROUTINE NAME
              </Text>
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                placeholder="e.g. Push Day A"
                placeholderTextColor={theme.textMuted}
                style={{ fontFamily: 'BarlowCondensed_700Bold', textTransform: 'uppercase', fontSize: 22, color: theme.text }}
              />
              {formState.errors.name?.message ? (
                <Text variant="caption" color="danger">
                  {formState.errors.name.message}
                </Text>
              ) : null}
            </View>
          )}
        />

        <Controller
          control={control}
          name="folder"
          render={({ field }) => (
            <View style={{ backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text font="mono" size={10} color="muted" style={{ letterSpacing: 1.5 }}>
                  FOLDER
                </Text>
                <TextInput
                  value={field.value}
                  onChangeText={field.onChange}
                  placeholder="e.g. Push Pull Legs"
                  placeholderTextColor={theme.textMuted}
                  style={{ flex: 1, marginLeft: spacing.sm, textAlign: 'right', fontSize: 13, fontWeight: '600', color: theme.text }}
                />
              </View>
              {existingFolders && existingFolders.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                  {existingFolders.map((f) => {
                    const active = folder === f;
                    return (
                      <Pressable
                        key={f}
                        onPress={() => setValue('folder', f)}
                        style={{ paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, backgroundColor: active ? theme.primary : theme.cardInset }}
                      >
                        <Text font="body" weight="600" size={11} style={{ color: active ? theme.onAccent : theme.textSecondary }}>
                          {f}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          )}
        />

        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <TextField label="Description (optional)" value={field.value} onChangeText={field.onChange} multiline />
          )}
        />
      </View>
    </Screen>
  );
}

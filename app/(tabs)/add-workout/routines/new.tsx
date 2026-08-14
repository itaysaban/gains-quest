import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { View, Pressable } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { useCreateRoutine, useRoutineFolders } from '@/hooks/useRoutines';
import { routineFormSchema, type RoutineFormValues } from '@/lib/utils/validation/routine';
import { useTheme, spacing, radius } from '@/lib/theme';

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
    <Screen scroll>
      <View style={{ gap: spacing.lg }}>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <TextField label="Name" placeholder="e.g. Push Day A" value={field.value} onChangeText={field.onChange} error={formState.errors.name?.message} />
          )}
        />
        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <TextField label="Description (optional)" value={field.value} onChangeText={field.onChange} multiline />
          )}
        />
        <View style={{ gap: spacing.sm }}>
          <Controller
            control={control}
            name="folder"
            render={({ field }) => (
              <TextField
                label="Folder / Program (optional)"
                placeholder="e.g. Push Pull Legs"
                value={field.value}
                onChangeText={field.onChange}
              />
            )}
          />
          {existingFolders && existingFolders.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {existingFolders.map((f) => {
                const active = folder === f;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setValue('folder', f)}
                    style={{
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 4,
                      borderRadius: radius.full,
                      backgroundColor: active ? theme.primary : theme.surfaceAlt,
                    }}
                  >
                    <Text variant="caption" weight="600" style={{ color: active ? '#FFF' : theme.text }}>
                      {f}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
        <Button label="Create Routine" onPress={handleSubmit(onSubmit)} loading={createRoutine.isPending} fullWidth />
      </View>
    </Screen>
  );
}

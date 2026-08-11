import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { useCreateRoutine } from '@/hooks/useRoutines';
import { routineFormSchema, type RoutineFormValues } from '@/lib/utils/validation/routine';
import { spacing } from '@/lib/theme';

export default function NewRoutine() {
  const router = useRouter();
  const createRoutine = useCreateRoutine();
  const { control, handleSubmit, formState } = useForm<RoutineFormValues>({
    resolver: zodResolver(routineFormSchema),
    defaultValues: { name: '', description: '' },
  });

  async function onSubmit(values: RoutineFormValues) {
    const routine = await createRoutine.mutateAsync(values);
    router.replace(`/(tabs)/routines/${routine.id}`);
  }

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
        <Button label="Create Routine" onPress={handleSubmit(onSubmit)} loading={createRoutine.isPending} fullWidth />
      </View>
    </Screen>
  );
}

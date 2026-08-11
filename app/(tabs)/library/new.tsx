import { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { ExerciseForm } from '@/components/exercise/ExerciseForm';
import { useCreateExercise, useCheckDuplicateExerciseName } from '@/hooks/useExercises';
import { useAuth } from '@/lib/auth/AuthProvider';
import type { ExerciseFormValues } from '@/lib/utils/validation/exercise';

export default function NewExercise() {
  const router = useRouter();
  const { session } = useAuth();
  const createExercise = useCreateExercise();
  const checkDuplicate = useCheckDuplicateExerciseName();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(values: ExerciseFormValues) {
    setSubmitting(true);
    try {
      const duplicates = await checkDuplicate.mutateAsync({ name: values.name, userId: session!.user.id });
      if (duplicates.length > 0) {
        Alert.alert(
          'Similar exercise exists',
          `You already have "${duplicates[0].name}". Create anyway, or consider cloning it instead as a variation?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => setSubmitting(false) },
            {
              text: 'Create Anyway',
              onPress: async () => {
                await createExercise.mutateAsync(values);
                router.back();
              },
            },
          ],
        );
        return;
      }
      await createExercise.mutateAsync(values);
      router.back();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll>
      <ExerciseForm onSubmit={handleSubmit} submitting={submitting} submitLabel="Create Exercise" />
    </Screen>
  );
}

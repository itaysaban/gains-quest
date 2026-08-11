import { z } from 'zod';

export const customFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'number']),
});

export const exerciseFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  category: z.enum(['push', 'pull', 'legs', 'core', 'cardio']),
  muscleGroups: z.array(z.string()),
  equipment: z.enum(['barbell', 'dumbbell', 'machine', 'bodyweight', 'cable', 'band']),
  trackingType: z.enum(['weight_reps', 'time', 'distance', 'bodyweight_reps']),
  notes: z.string().max(2000).optional().or(z.literal('')),
  customFields: z.array(customFieldSchema),
});

export type ExerciseFormValues = z.infer<typeof exerciseFormSchema>;

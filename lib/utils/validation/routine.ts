import { z } from 'zod';

export const routineFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  description: z.string().max(500).optional().or(z.literal('')),
});

export type RoutineFormValues = z.infer<typeof routineFormSchema>;

export const routineExerciseTargetSchema = z.object({
  targetSets: z.number().int().min(1).max(20).nullable().optional(),
  targetRepsMin: z.number().int().min(1).max(100).nullable().optional(),
  targetRepsMax: z.number().int().min(1).max(100).nullable().optional(),
  targetWeight: z.number().min(0).nullable().optional(),
  restSeconds: z.number().int().min(0).max(1200).nullable().optional(),
});

export type RoutineExerciseTargetValues = z.infer<typeof routineExerciseTargetSchema>;

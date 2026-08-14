import { routineFormSchema, routineExerciseTargetSchema } from '../routine';

describe('routineFormSchema', () => {
  it('accepts a name-only routine', () => {
    expect(routineFormSchema.safeParse({ name: 'Push Day' }).success).toBe(true);
  });

  it('trims whitespace from the name', () => {
    const result = routineFormSchema.safeParse({ name: '  Push Day  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Push Day');
  });

  it('rejects an empty name', () => {
    expect(routineFormSchema.safeParse({ name: '' }).success).toBe(false);
  });

  it('rejects a name over 80 characters', () => {
    expect(routineFormSchema.safeParse({ name: 'a'.repeat(81) }).success).toBe(false);
  });

  it('allows description and folder to be omitted or empty', () => {
    expect(routineFormSchema.safeParse({ name: 'Push Day', description: undefined, folder: undefined }).success).toBe(
      true,
    );
    expect(routineFormSchema.safeParse({ name: 'Push Day', description: '', folder: '' }).success).toBe(true);
  });

  it('rejects a description over 500 characters', () => {
    expect(routineFormSchema.safeParse({ name: 'Push Day', description: 'a'.repeat(501) }).success).toBe(false);
  });

  it('rejects a folder over 80 characters', () => {
    expect(routineFormSchema.safeParse({ name: 'Push Day', folder: 'a'.repeat(81) }).success).toBe(false);
  });
});

describe('routineExerciseTargetSchema', () => {
  const valid = {
    targetSets: 3,
    targetRepsMin: 8,
    targetRepsMax: 12,
    targetWeight: 60,
    restSeconds: 90,
  };

  it('accepts fully specified targets', () => {
    expect(routineExerciseTargetSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts all fields as null or omitted', () => {
    expect(
      routineExerciseTargetSchema.safeParse({
        targetSets: null,
        targetRepsMin: null,
        targetRepsMax: null,
        targetWeight: null,
        restSeconds: null,
      }).success,
    ).toBe(true);
    expect(routineExerciseTargetSchema.safeParse({}).success).toBe(true);
  });

  it('rejects targetSets outside 1-20', () => {
    expect(routineExerciseTargetSchema.safeParse({ ...valid, targetSets: 0 }).success).toBe(false);
    expect(routineExerciseTargetSchema.safeParse({ ...valid, targetSets: 21 }).success).toBe(false);
  });

  it('rejects a non-integer targetSets', () => {
    expect(routineExerciseTargetSchema.safeParse({ ...valid, targetSets: 3.5 }).success).toBe(false);
  });

  it('rejects targetRepsMin/Max outside 1-100', () => {
    expect(routineExerciseTargetSchema.safeParse({ ...valid, targetRepsMin: 0 }).success).toBe(false);
    expect(routineExerciseTargetSchema.safeParse({ ...valid, targetRepsMax: 101 }).success).toBe(false);
  });

  it('rejects a negative targetWeight', () => {
    expect(routineExerciseTargetSchema.safeParse({ ...valid, targetWeight: -5 }).success).toBe(false);
  });

  it('rejects restSeconds outside 0-1200', () => {
    expect(routineExerciseTargetSchema.safeParse({ ...valid, restSeconds: -1 }).success).toBe(false);
    expect(routineExerciseTargetSchema.safeParse({ ...valid, restSeconds: 1201 }).success).toBe(false);
  });
});

import { exerciseFormSchema, customFieldSchema } from '../exercise';

describe('exerciseFormSchema', () => {
  const valid = {
    name: 'Bench Press',
    category: 'push' as const,
    muscleGroups: ['chest', 'triceps'],
    equipment: 'barbell' as const,
    trackingType: 'weight_reps' as const,
    notes: '',
    customFields: [],
  };

  it('accepts a fully valid exercise', () => {
    const result = exerciseFormSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('trims whitespace from the name', () => {
    const result = exerciseFormSchema.safeParse({ ...valid, name: '  Squat  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('Squat');
  });

  it('rejects an empty name', () => {
    const result = exerciseFormSchema.safeParse({ ...valid, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a name over 80 characters', () => {
    const result = exerciseFormSchema.safeParse({ ...valid, name: 'a'.repeat(81) });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized category', () => {
    const result = exerciseFormSchema.safeParse({ ...valid, category: 'wings' });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized equipment value', () => {
    const result = exerciseFormSchema.safeParse({ ...valid, equipment: 'kettlebell' });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized trackingType value', () => {
    const result = exerciseFormSchema.safeParse({ ...valid, trackingType: 'reps_only' });
    expect(result.success).toBe(false);
  });

  it('allows notes to be omitted, empty, or a normal string', () => {
    expect(exerciseFormSchema.safeParse({ ...valid, notes: undefined }).success).toBe(true);
    expect(exerciseFormSchema.safeParse({ ...valid, notes: '' }).success).toBe(true);
    expect(exerciseFormSchema.safeParse({ ...valid, notes: 'Keep elbows tucked' }).success).toBe(true);
  });

  it('rejects notes over 2000 characters', () => {
    const result = exerciseFormSchema.safeParse({ ...valid, notes: 'a'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('accepts an empty customFields array and rejects a malformed entry', () => {
    expect(exerciseFormSchema.safeParse({ ...valid, customFields: [] }).success).toBe(true);
    expect(
      exerciseFormSchema.safeParse({ ...valid, customFields: [{ key: '', label: 'Tempo', type: 'text' }] }).success,
    ).toBe(false);
  });
});

describe('customFieldSchema', () => {
  it('accepts a valid text field', () => {
    expect(customFieldSchema.safeParse({ key: 'tempo', label: 'Tempo', type: 'text' }).success).toBe(true);
  });

  it('accepts a valid number field', () => {
    expect(customFieldSchema.safeParse({ key: 'incline', label: 'Incline', type: 'number' }).success).toBe(true);
  });

  it('rejects an unrecognized type', () => {
    expect(customFieldSchema.safeParse({ key: 'incline', label: 'Incline', type: 'boolean' }).success).toBe(false);
  });

  it('rejects a missing key or label', () => {
    expect(customFieldSchema.safeParse({ key: '', label: 'Incline', type: 'number' }).success).toBe(false);
    expect(customFieldSchema.safeParse({ key: 'incline', label: '', type: 'number' }).success).toBe(false);
  });
});

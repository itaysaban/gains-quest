import { splitMuscleGroups, TRACKING_TYPE_LABELS } from '../exercise';

describe('splitMuscleGroups', () => {
  it('treats the first entry as primary and the rest as secondary', () => {
    expect(splitMuscleGroups(['chest', 'triceps', 'shoulders'])).toEqual({
      primary: 'chest',
      secondary: ['triceps', 'shoulders'],
    });
  });

  it('has no secondary muscles when only one is listed', () => {
    expect(splitMuscleGroups(['biceps'])).toEqual({ primary: 'biceps', secondary: [] });
  });

  it('returns a null primary and no secondary muscles for an empty list', () => {
    expect(splitMuscleGroups([])).toEqual({ primary: null, secondary: [] });
  });
});

describe('TRACKING_TYPE_LABELS', () => {
  it('has a readable label for every tracking type', () => {
    expect(TRACKING_TYPE_LABELS.weight_reps).toBe('Weight × Reps');
    expect(TRACKING_TYPE_LABELS.bodyweight_reps).toBe('Bodyweight Reps');
    expect(TRACKING_TYPE_LABELS.time).toBe('Time');
    expect(TRACKING_TYPE_LABELS.distance).toBe('Distance');
    expect(TRACKING_TYPE_LABELS.distance_duration).toBe('Distance + Time');
  });
});

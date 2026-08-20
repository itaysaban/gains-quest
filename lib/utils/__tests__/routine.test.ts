import { isSupersetLinkedToPrevious, supersetLabel } from '../routine';
import { makeRoutineExercise } from '@/lib/testing/fixtures';

// Superset grouping/labeling is a Routine Builder UI convention from the design handoff (§5) — the
// PRD itself only requires that "two or more exercises can be grouped so the logger alternates
// between them" (§6.1.2), with no specific labeling scheme mandated.
describe('supersetLabel', () => {
  it('returns undefined for an item with no superset_group_id', () => {
    const items = [makeRoutineExercise({ superset_group_id: null })];
    expect(supersetLabel(items, 0)).toBeUndefined();
  });

  it('returns undefined for an item linked to the previous one — only a group\'s first item gets a label', () => {
    const items = [
      makeRoutineExercise({ superset_group_id: 'group-a' }),
      makeRoutineExercise({ superset_group_id: 'group-a' }),
    ];
    expect(supersetLabel(items, 1)).toBeUndefined();
  });

  it('labels the first item of the first distinct group "SUPERSET A"', () => {
    const items = [
      makeRoutineExercise({ superset_group_id: null }),
      makeRoutineExercise({ superset_group_id: 'group-a' }),
      makeRoutineExercise({ superset_group_id: 'group-a' }),
    ];
    expect(supersetLabel(items, 1)).toBe('SUPERSET A');
  });

  it('labels the first item of a second, later distinct group "SUPERSET B"', () => {
    const items = [
      makeRoutineExercise({ superset_group_id: 'group-a' }),
      makeRoutineExercise({ superset_group_id: 'group-a' }),
      makeRoutineExercise({ superset_group_id: null }),
      makeRoutineExercise({ superset_group_id: 'group-b' }),
      makeRoutineExercise({ superset_group_id: 'group-b' }),
    ];
    expect(supersetLabel(items, 3)).toBe('SUPERSET B');
  });

  it('increments to "SUPERSET C" for a third distinct group — the letter tracks group count, not position', () => {
    const items = [
      makeRoutineExercise({ superset_group_id: 'group-a' }),
      makeRoutineExercise({ superset_group_id: 'group-a' }),
      makeRoutineExercise({ superset_group_id: 'group-b' }),
      makeRoutineExercise({ superset_group_id: 'group-b' }),
      makeRoutineExercise({ superset_group_id: 'group-c' }),
    ];
    expect(supersetLabel(items, 4)).toBe('SUPERSET C');
  });
});

describe('isSupersetLinkedToPrevious', () => {
  it('is always false for the first item in the list', () => {
    const items = [makeRoutineExercise({ superset_group_id: 'group-a' })];
    expect(isSupersetLinkedToPrevious(items, 0)).toBe(false);
  });

  it('is true when the current and previous item share a superset_group_id', () => {
    const items = [
      makeRoutineExercise({ superset_group_id: 'group-a' }),
      makeRoutineExercise({ superset_group_id: 'group-a' }),
    ];
    expect(isSupersetLinkedToPrevious(items, 1)).toBe(true);
  });

  it('is false when the current item starts a new group', () => {
    const items = [
      makeRoutineExercise({ superset_group_id: 'group-a' }),
      makeRoutineExercise({ superset_group_id: 'group-b' }),
    ];
    expect(isSupersetLinkedToPrevious(items, 1)).toBe(false);
  });
});

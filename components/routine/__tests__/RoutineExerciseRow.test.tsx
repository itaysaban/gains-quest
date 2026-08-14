import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { RoutineExerciseRow } from '../RoutineExerciseRow';
import { makeExercise } from '@/lib/testing/fixtures';
import type { RoutineExerciseWithDetails } from '@/types/domain';

// Regression test for the routine-tab "typing bug": Sets/Reps/Rest/Note used to call onPatch()
// straight from onChangeText, firing a network write per keystroke with no local echo — the input
// visibly snapped back to the old value between keystrokes on fast typing. Fields must now be local
// drafts that only commit (call onPatch) on blur.

function makeItem(overrides: Partial<RoutineExerciseWithDetails> = {}): RoutineExerciseWithDetails {
  return {
    id: 're-1',
    routine_id: 'routine-1',
    user_id: 'test-user-id',
    exercise_id: 'exercise-1',
    order_index: 0,
    superset_group_id: null,
    target_sets: null,
    target_reps_min: null,
    target_reps_max: null,
    target_weight: null,
    rest_seconds: null,
    note: null,
    created_at: new Date().toISOString(),
    exercise: makeExercise({ id: 'exercise-1', name: 'Bench Press' }),
    ...overrides,
  };
}

const noop = () => {};

it('does not call onPatch while typing — only on blur', async () => {
  const onPatch = jest.fn();
  await render(
    <RoutineExerciseRow item={makeItem()} isSupersetLinked={false} onDrag={noop} onRemove={noop} onToggleSuperset={noop} onPatch={onPatch} />,
  );

  // Sets, Reps, and Rest are all empty by default, so getByDisplayValue('') would match three
  // inputs — Sets is the first of the three in render order.
  const setsInput = screen.getAllByDisplayValue('')[0];
  await act(async () => fireEvent.changeText(setsInput, '1'));
  await act(async () => fireEvent.changeText(setsInput, '12'));

  expect(onPatch).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue('12')).toBeTruthy(); // typed value shows immediately, no round trip needed

  await act(async () => fireEvent(setsInput, 'blur'));
  expect(onPatch).toHaveBeenCalledWith({ target_sets: 12 });
});

it('commits reps to both target_reps_min and target_reps_max on blur', async () => {
  const onPatch = jest.fn();
  await render(
    <RoutineExerciseRow item={makeItem()} isSupersetLinked={false} onDrag={noop} onRemove={noop} onToggleSuperset={noop} onPatch={onPatch} />,
  );

  const repsInput = screen.getByPlaceholderText('e.g. 8');
  await act(async () => fireEvent.changeText(repsInput, '10'));
  await act(async () => fireEvent(repsInput, 'blur'));

  expect(onPatch).toHaveBeenCalledWith({ target_reps_min: 10, target_reps_max: 10 });
});

it('reverts to the last saved value on blur when erased without a replacement (PRD §9 edge case) — no network call either', async () => {
  const onPatch = jest.fn();
  await render(
    <RoutineExerciseRow
      item={makeItem({ rest_seconds: 90 })}
      isSupersetLinked={false}
      onDrag={noop}
      onRemove={noop}
      onToggleSuperset={noop}
      onPatch={onPatch}
    />,
  );

  const restInput = screen.getByDisplayValue('90');
  await act(async () => fireEvent.changeText(restInput, ''));
  await act(async () => fireEvent(restInput, 'blur'));

  expect(screen.getByDisplayValue('90')).toBeTruthy(); // reverted locally
  expect(onPatch).not.toHaveBeenCalled(); // nothing changed, so nothing to persist
});

it('erasing and typing a real replacement still commits the new value on blur', async () => {
  const onPatch = jest.fn();
  await render(
    <RoutineExerciseRow
      item={makeItem({ rest_seconds: 90 })}
      isSupersetLinked={false}
      onDrag={noop}
      onRemove={noop}
      onToggleSuperset={noop}
      onPatch={onPatch}
    />,
  );

  const restInput = screen.getByDisplayValue('90');
  await act(async () => fireEvent.changeText(restInput, ''));
  await act(async () => fireEvent.changeText(restInput, '60'));
  await act(async () => fireEvent(restInput, 'blur'));

  expect(onPatch).toHaveBeenCalledWith({ rest_seconds: 60 });
});

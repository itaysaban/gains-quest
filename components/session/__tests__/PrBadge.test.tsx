import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { PrBadge } from '../PrBadge';
import type { LoggedSet } from '@/types/domain';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

function makeSet(overrides: Partial<LoggedSet>): LoggedSet {
  return {
    id: 'set-1',
    is_pr: false,
    weight: 100,
    reps: 5,
    set_type: 'working',
    ...overrides,
  } as unknown as LoggedSet;
}

describe('PrBadge', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows nothing when no logged set is a PR', async () => {
    await render(<PrBadge sets={[makeSet({ id: 's1', is_pr: false })]} exerciseName="Bench Press" />);
    expect(screen.queryByText(/New PR/)).toBeNull();
  });

  it('shows a toast with the exercise name when the latest set is a PR', async () => {
    await render(<PrBadge sets={[makeSet({ id: 's1', is_pr: true })]} exerciseName="Bench Press" />);
    expect(screen.getByText('New PR — Bench Press! 🏆')).toBeTruthy();
  });

  it('picks the most recent PR set when scanning from the end of the list', async () => {
    await render(
      <PrBadge
        sets={[makeSet({ id: 's1', is_pr: true }), makeSet({ id: 's2', is_pr: false })]}
        exerciseName="Squat"
      />,
    );
    // s2 (latest) is not a PR, but s1 earlier in the list is — still found and celebrated.
    expect(screen.getByText('New PR — Squat! 🏆')).toBeTruthy();
  });

  it('auto-hides the toast after the default duration', async () => {
    await render(<PrBadge sets={[makeSet({ id: 's1', is_pr: true })]} exerciseName="Deadlift" />);
    expect(screen.getByText('New PR — Deadlift! 🏆')).toBeTruthy();

    await act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.queryByText(/New PR/)).toBeNull();
  });

  it('does not re-celebrate the same set id on rerender', async () => {
    const view = await render(<PrBadge sets={[makeSet({ id: 's1', is_pr: true })]} exerciseName="Row" />);

    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByText(/New PR/)).toBeNull();

    // Same PR set passed again (e.g. parent re-render after an unrelated refetch) must not re-toast.
    await view.rerender(<PrBadge sets={[makeSet({ id: 's1', is_pr: true })]} exerciseName="Row" />);
    expect(screen.queryByText(/New PR/)).toBeNull();
  });

  it('celebrates a newly added PR set without re-celebrating the earlier one', async () => {
    const view = await render(<PrBadge sets={[makeSet({ id: 's1', is_pr: true })]} exerciseName="Row" />);
    await act(() => {
      jest.advanceTimersByTime(2000);
    });

    await view.rerender(
      <PrBadge sets={[makeSet({ id: 's1', is_pr: true }), makeSet({ id: 's2', is_pr: true })]} exerciseName="Row" />,
    );
    expect(screen.getByText('New PR — Row! 🏆')).toBeTruthy();
  });
});

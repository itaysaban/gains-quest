import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SetInputAdjuster } from '../SetInputAdjuster';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn().mockResolvedValue(undefined) }));

describe('SetInputAdjuster', () => {
  it('renders the label and current value', async () => {
    await render(<SetInputAdjuster label="Weight" value={60} step={2.5} onChange={jest.fn()} />);
    expect(screen.getByText('WEIGHT')).toBeTruthy();
    expect(screen.getByDisplayValue('60')).toBeTruthy();
  });

  it('appends the unit to the label when provided', async () => {
    await render(<SetInputAdjuster label="Weight" value={60} step={2.5} onChange={jest.fn()} unit="lb" />);
    expect(screen.getByText('WEIGHT (LB)')).toBeTruthy();
  });

  it('renders an empty input when value is null', async () => {
    await render(<SetInputAdjuster label="Reps" value={null} step={1} onChange={jest.fn()} />);
    expect(screen.getByDisplayValue('')).toBeTruthy();
  });

  it('the + button increments value by step', async () => {
    // decimals defaults to 0, so step/value are kept whole here — fractional-step
    // rounding is covered separately below.
    const onChange = jest.fn();
    await render(<SetInputAdjuster label="Weight" value={60} step={5} onChange={onChange} />);
    fireEvent.press(screen.getByRole('button', { name: 'Increase Weight' }));
    expect(onChange).toHaveBeenCalledWith(65);
  });

  it('the - button decrements value by step', async () => {
    const onChange = jest.fn();
    await render(<SetInputAdjuster label="Weight" value={60} step={5} onChange={onChange} />);
    fireEvent.press(screen.getByRole('button', { name: 'Decrease Weight' }));
    expect(onChange).toHaveBeenCalledWith(55);
  });

  it('treats a null value as 0 when adjusting', async () => {
    const onChange = jest.fn();
    await render(<SetInputAdjuster label="Reps" value={null} step={1} onChange={onChange} />);
    fireEvent.press(screen.getByRole('button', { name: 'Increase Reps' }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('never decrements below 0', async () => {
    const onChange = jest.fn();
    await render(<SetInputAdjuster label="Reps" value={1} step={2} onChange={onChange} />);
    fireEvent.press(screen.getByRole('button', { name: 'Decrease Reps' }));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('rounds the adjusted value to the configured decimals', async () => {
    const onChange = jest.fn();
    await render(<SetInputAdjuster label="Weight" value={60.333} step={0.1} onChange={onChange} decimals={1} />);
    fireEvent.press(screen.getByRole('button', { name: 'Increase Weight' }));
    expect(onChange).toHaveBeenCalledWith(60.4);
  });

  it('typing a value calls onChange with the parsed number', async () => {
    const onChange = jest.fn();
    await render(<SetInputAdjuster label="Weight" value={60} step={2.5} onChange={onChange} />);
    fireEvent.changeText(screen.getByDisplayValue('60'), '75');
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it('clearing the text field calls onChange with null', async () => {
    const onChange = jest.fn();
    await render(<SetInputAdjuster label="Weight" value={60} step={2.5} onChange={onChange} />);
    fireEvent.changeText(screen.getByDisplayValue('60'), '');
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('strips non-numeric characters while typing', async () => {
    const onChange = jest.fn();
    await render(<SetInputAdjuster label="Weight" value={60} step={2.5} onChange={onChange} />);
    fireEvent.changeText(screen.getByDisplayValue('60'), '7a5');
    expect(onChange).toHaveBeenCalledWith(75);
  });
});

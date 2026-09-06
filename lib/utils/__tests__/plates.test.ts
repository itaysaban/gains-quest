import { calculatePlates, formatPlateLoad, isPlateLoadable } from '../plates';

// Plate calculator — PRD §6.1.3. Pure arithmetic, so it is worth testing hard: the failure mode is
// a lifter loading the wrong weight, which is worse than showing nothing.

describe('calculatePlates (kg)', () => {
  it('loads a clean 100 kg on a 20 kg bar', () => {
    const load = calculatePlates(100, 'kg', 20)!;
    expect(load.perSide).toEqual([25, 15]);
    expect(load.achieved).toBe(100);
    expect(load.remainder).toBe(0);
  });

  it('prefers the heaviest plates that fit', () => {
    // 60 kg -> 20 per side, which must be a single 20 rather than 15 + 5 or 10 + 10.
    expect(calculatePlates(60, 'kg', 20)!.perSide).toEqual([20]);
  });

  it('returns an empty load for a bare bar rather than null', () => {
    const load = calculatePlates(20, 'kg', 20)!;
    expect(load.perSide).toEqual([]);
    expect(load.achieved).toBe(20);
    // Distinct from "cannot be loaded" — the caller labels this as just the bar.
    expect(load).not.toBeNull();
  });

  it('returns null below the bar, where nothing can be loaded', () => {
    expect(calculatePlates(15, 'kg', 20)).toBeNull();
  });

  it('returns null when the target is above the bar but no plate pair fits', () => {
    // 21 kg means 0.5 per side; the smallest plate is 1.25.
    expect(calculatePlates(21, 'kg', 20)).toBeNull();
  });

  it('reports the shortfall when the target is not exactly loadable', () => {
    // 103 kg -> 41.5 per side. Greedy reaches 41.25, leaving 0.25 per side = 0.5 total.
    const load = calculatePlates(103, 'kg', 20)!;
    expect(load.achieved).toBe(102.5);
    expect(load.remainder).toBe(0.5);
  });

  it('handles the 15 kg bar', () => {
    const load = calculatePlates(55, 'kg', 15)!;
    expect(load.bar).toBe(15);
    expect(load.perSide).toEqual([20]);
    expect(load.achieved).toBe(55);
  });

  it('does not drop a small plate to floating-point error', () => {
    // 2.5 and 1.25 accumulate representation error; 47.5 -> 13.75 per side = 10 + 2.5 + 1.25.
    const load = calculatePlates(47.5, 'kg', 20)!;
    expect(load.perSide).toEqual([10, 2.5, 1.25]);
    expect(load.remainder).toBe(0);
  });
});

describe('calculatePlates (lb)', () => {
  it('uses real lb plates, not converted kg ones', () => {
    // 225 lb is the classic two-45s-a-side. Stored canonically in kg, displayed in lb.
    const targetKg = 225 * 0.45359237;
    const load = calculatePlates(targetKg, 'lb', 20)!;
    expect(load.bar).toBe(45);
    expect(load.perSide).toEqual([45, 45]);
    expect(load.achieved).toBe(225);
    expect(load.remainder).toBe(0);
  });

  it('uses the 35 lb bar when the stored bar is the 15 kg one', () => {
    const targetKg = 35 * 0.45359237;
    expect(calculatePlates(targetKg, 'lb', 15)!.bar).toBe(35);
  });

  it('never returns a plate that is not in the lb set', () => {
    const load = calculatePlates(100, 'lb', 20)!;
    const lbPlates = [45, 35, 25, 10, 5, 2.5];
    load.perSide.forEach((p) => expect(lbPlates).toContain(p));
  });
});

describe('formatPlateLoad', () => {
  it('reads as a lifter would say it', () => {
    expect(formatPlateLoad(calculatePlates(100, 'kg', 20)!)).toBe('25 + 15');
  });

  it('trims trailing zeros on fractional plates', () => {
    expect(formatPlateLoad(calculatePlates(45, 'kg', 20)!)).toBe('10 + 2.5');
  });

  it('is empty for a bare bar, so the caller can label it instead', () => {
    expect(formatPlateLoad(calculatePlates(20, 'kg', 20)!)).toBe('');
  });
});

describe('isPlateLoadable', () => {
  it('is true only for barbells', () => {
    expect(isPlateLoadable('barbell')).toBe(true);
    ['dumbbell', 'machine', 'cable', 'bodyweight', 'band', null, undefined].forEach((e) => {
      expect(isPlateLoadable(e)).toBe(false);
    });
  });
});

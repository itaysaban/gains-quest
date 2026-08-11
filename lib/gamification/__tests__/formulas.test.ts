import { epley1RM, setVolume, previewSetXp, xpProgress } from '../formulas';

describe('epley1RM', () => {
  it('computes weight * (1 + reps/30)', () => {
    expect(epley1RM(100, 10)).toBeCloseTo(133.33, 1);
  });

  it('returns null when weight is missing', () => {
    expect(epley1RM(null, 10)).toBeNull();
  });

  it('returns null when reps is missing or zero', () => {
    expect(epley1RM(100, null)).toBeNull();
    expect(epley1RM(100, 0)).toBeNull();
  });
});

describe('setVolume', () => {
  it('multiplies weight by reps', () => {
    expect(setVolume(60, 8)).toBe(480);
  });

  it('treats missing weight as 0 (bodyweight-style sets)', () => {
    expect(setVolume(null, 12)).toBe(0);
  });

  it('treats missing reps as 1', () => {
    expect(setVolume(100, null)).toBe(100);
  });
});

describe('previewSetXp', () => {
  it('awards a small flat amount for warm-up sets regardless of load', () => {
    expect(previewSetXp(200, 20, 9, 'warmup', 1000)).toBe(2);
  });

  it('gives neutral (1x) volume multiplier on the first time logging an exercise (no trailing average)', () => {
    const xp = previewSetXp(100, 10, null, 'working', null);
    expect(xp).toBe(10); // BASE_XP * 1 (volume) * 1 (no RPE)
  });

  it('scales up when volume exceeds the trailing average, capped at 2x', () => {
    const atBaseline = previewSetXp(100, 10, null, 'working', 1000); // volume 1000 == avg
    const doubleBaseline = previewSetXp(100, 20, null, 'working', 1000); // volume 2000 == 2x avg
    const wayAboveBaseline = previewSetXp(100, 40, null, 'working', 1000); // volume 4000, still capped at 2x
    expect(atBaseline).toBe(10); // 0.5 + 0.5*1 = 1x multiplier
    expect(doubleBaseline).toBe(15); // 0.5 + 0.5*2 = 1.5x multiplier
    expect(doubleBaseline).toBe(wayAboveBaseline);
  });

  it('applies an effort multiplier from RPE, clamped between 0.8x and 1.3x', () => {
    const lowRpe = previewSetXp(100, 10, 3, 'working', null); // 1 + (3-7)*0.05 = 0.8 -> clamped
    const highRpe = previewSetXp(100, 10, 10, 'working', null); // 1 + (10-7)*0.05 = 1.15
    expect(lowRpe).toBe(8); // 10 * 1 * 0.8
    expect(highRpe).toBe(12); // 10 * 1 * 1.15 -> rounds to 12 (11.5)
  });

  it('never returns less than 1 XP for a working set', () => {
    expect(previewSetXp(0, 0, 0, 'working', 5000)).toBeGreaterThanOrEqual(1);
  });
});

describe('xpProgress', () => {
  it('computes progress ratio within the current level band', () => {
    const result = xpProgress(150, 100, 250);
    expect(result.into).toBe(50);
    expect(result.span).toBe(150);
    expect(result.ratio).toBeCloseTo(0.333, 2);
  });

  it('clamps ratio at 1 when totalXp meets or exceeds the next threshold', () => {
    const result = xpProgress(300, 100, 250);
    expect(result.ratio).toBe(1);
  });

  it('handles a missing next-level threshold (max level) without dividing by zero', () => {
    const result = xpProgress(500, 400, null);
    expect(result.span).toBe(100);
    expect(result.ratio).toBe(1);
  });
});

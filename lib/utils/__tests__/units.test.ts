import { kgToLb, lbToKg, displayWeight, toStoredKg } from '../units';

describe('unit conversion', () => {
  it('converts kg to lb and back within rounding tolerance', () => {
    expect(kgToLb(100)).toBeCloseTo(220.46, 1);
    expect(lbToKg(kgToLb(100))).toBeCloseTo(100, 6);
  });

  it('displayWeight passes kg through unchanged when the preference is kg', () => {
    expect(displayWeight(100, 'kg')).toBe(100);
  });

  it('displayWeight converts and rounds to 1 decimal when the preference is lb', () => {
    expect(displayWeight(100, 'lb')).toBeCloseTo(220.5, 1);
  });

  it('displayWeight passes through null (no value logged yet)', () => {
    expect(displayWeight(null, 'lb')).toBeNull();
  });

  it('toStoredKg converts a user-entered lb value back to the stored kg baseline', () => {
    expect(toStoredKg(220.46, 'lb')).toBeCloseTo(100, 1);
  });

  it('toStoredKg passes a kg entry through unchanged', () => {
    expect(toStoredKg(100, 'kg')).toBe(100);
  });
});

import type { UnitPreference } from '@/types/database.types';

const KG_PER_LB = 0.45359237;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** Weights are always stored in kg; this only affects display/input. */
export function displayWeight(kg: number | null, unit: UnitPreference): number | null {
  if (kg == null) return null;
  return unit === 'lb' ? Math.round(kgToLb(kg) * 10) / 10 : kg;
}

export function toStoredKg(value: number, unit: UnitPreference): number {
  return unit === 'lb' ? lbToKg(value) : value;
}

export function unitLabel(unit: UnitPreference): string {
  return unit;
}

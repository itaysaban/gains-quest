import type { UnitPreference } from '@/types/database.types';

/** Plate calculator — PRD §6.1.3, resolved 2026-09-06 as "minimal": a standard bar and a standard
 * plate set, no per-gym plate inventory. Pure arithmetic, no server round trip, because it renders
 * on the highest-traffic screen in the app where the PRD's stated priority is speed. */

/** Bars people actually load. 20 kg is the default; 15 kg is the women's Olympic bar. */
export const BAR_WEIGHTS_KG = [20, 15] as const;

/** A standard competition-ish plate set, heaviest first — the greedy fill below depends on that
 * order. Values are per plate, and plates are always loaded in pairs. */
const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
const PLATES_LB = [45, 35, 25, 10, 5, 2.5];

const KG_PER_LB = 0.45359237;

export interface PlateLoad {
  /** Plates for ONE side of the bar, heaviest first, in the display unit. */
  perSide: number[];
  /** Weight the listed plates actually achieve, in the display unit — bar included. */
  achieved: number;
  /** Shortfall between the requested weight and `achieved`, in the display unit. 0 when exact. */
  remainder: number;
  /** The bar used, in the display unit. */
  bar: number;
}

/** Works out which plates to hang on each side to reach `targetKg`.
 *
 * Everything is computed in the DISPLAY unit rather than in kg, because plate sets are not
 * conversions of each other — a gym with lb plates has 45s and 35s, not 20.4 kg and 15.9 kg ones.
 * Converting a kg answer into lb would produce numbers that match no plate anyone owns.
 *
 * Returns null when the target cannot be loaded at all: below the bar, or so close to it that no
 * plate pair fits. A caller should render nothing in that case rather than an empty barbell, which
 * reads as "no plates needed" and is a different claim.
 */
export function calculatePlates(targetKg: number, unit: UnitPreference, barKg: number = 20): PlateLoad | null {
  if (!Number.isFinite(targetKg) || !Number.isFinite(barKg) || targetKg <= 0) return null;

  const toDisplay = (kg: number) => (unit === 'lb' ? kg / KG_PER_LB : kg);
  const plates = unit === 'lb' ? PLATES_LB : PLATES_KG;

  // In lb the bar is the real-world 45/35, not a converted 44.09 — same reasoning as the plates.
  const bar = unit === 'lb' ? (barKg === 15 ? 35 : 45) : barKg;
  const target = toDisplay(targetKg);

  const perSideTarget = (target - bar) / 2;
  if (perSideTarget < 0) return null;

  const perSide: number[] = [];
  let left = perSideTarget;
  for (const plate of plates) {
    // Float tolerance: 2.5 and 1.25 kg plates accumulate representation error fast enough to drop a
    // plate that should fit, so compare with a small epsilon rather than exactly.
    while (left + 1e-9 >= plate) {
      perSide.push(plate);
      left -= plate;
    }
  }

  if (perSide.length === 0 && perSideTarget > 1e-9) return null;

  const loaded = perSide.reduce((sum, p) => sum + p, 0);
  const achieved = bar + loaded * 2;

  return {
    perSide,
    achieved: round2(achieved),
    remainder: round2(Math.max(0, target - achieved)),
    bar,
  };
}

/** "20 + 10 + 2.5" — the per-side list as a reader would say it out loud. Empty string for a bare
 * bar, which the caller should label rather than render as an empty line. */
export function formatPlateLoad(load: PlateLoad): string {
  if (load.perSide.length === 0) return '';
  return load.perSide.map((p) => trimZeros(p)).join(' + ');
}

/** The plate calculator only makes sense for a loadable barbell — a dumbbell or a machine has no
 * per-side plate maths worth showing. */
export function isPlateLoadable(equipment: string | null | undefined): boolean {
  return equipment === 'barbell';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function trimZeros(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

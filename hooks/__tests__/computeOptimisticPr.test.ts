jest.mock('../../lib/supabase');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { computeOptimisticPr } from '../useLoggedSets';
import { makeCurrentBest } from '@/lib/testing/fixtures';

// PRD 6.1.4 defines four PR types (max weight, best e1RM, max reps at a given weight, best set
// volume). The server (fn_process_logged_set) implements all four; this client-side optimistic
// preview exists only for instant UI feedback and used to miss two things the server correctly
// handles: it never checked "reps at weight" at all, and it didn't gate e1RM to the 1-12 rep range
// the Epley formula is actually valid for. Both are exercised here.

describe('computeOptimisticPr', () => {
  it('never flags a warmup set as a PR, regardless of load', () => {
    const currentBest = makeCurrentBest({ best_weight: 50 });
    expect(computeOptimisticPr({ setType: 'warmup', weight: 200, reps: 5 }, currentBest)).toEqual({
      isPr: false,
      e1rm: null,
    });
  });

  it('flags a max-weight PR', () => {
    const currentBest = makeCurrentBest({ best_weight: 100 });
    const result = computeOptimisticPr({ setType: 'working', weight: 105, reps: 3 }, currentBest);
    expect(result.isPr).toBe(true);
  });

  it('flags an est-1RM PR within the 1-12 rep range', () => {
    const currentBest = makeCurrentBest({ best_weight: 100, best_est_1rm: 110 });
    // 90kg x 10 reps -> e1RM 120, beats 110, but doesn't beat best_weight (100) or anything else.
    const result = computeOptimisticPr({ setType: 'working', weight: 90, reps: 10 }, currentBest);
    expect(result.isPr).toBe(true);
    expect(result.e1rm).not.toBeNull();
  });

  it('does NOT compute or credit an e1RM PR outside the 1-12 rep range, even if the raw formula would beat the record', () => {
    const currentBest = makeCurrentBest({ best_weight: 100, best_est_1rm: 110 });
    // 50kg x 20 reps -> naive Epley would be 83.3, doesn't actually beat 110 here, but the point is
    // e1rm must come back null (excluded), not just "happens not to beat the record".
    const result = computeOptimisticPr({ setType: 'working', weight: 50, reps: 20 }, currentBest);
    expect(result.e1rm).toBeNull();
  });

  it('flags a best-set-volume PR', () => {
    const currentBest = makeCurrentBest({ best_weight: 100, best_est_1rm: 130, best_set_volume: 500 });
    // 80kg x 8 = 640 volume, beats 500, but doesn't beat weight(100) or e1rm(130: 80*(1+8/30)=101.3).
    const result = computeOptimisticPr({ setType: 'working', weight: 80, reps: 8 }, currentBest);
    expect(result.isPr).toBe(true);
  });

  it('flags a max-reps-at-the-current-best-weight PR (the gap this fix closes)', () => {
    const currentBest = makeCurrentBest({ best_weight: 100, best_weight_reps: 5, best_est_1rm: 130, best_set_volume: 900 });
    // Same weight as the record (100kg), more reps (6) than last time at that weight (5) — a real
    // PR per PRD's "max reps at a given weight" type — but doesn't beat weight/e1RM/volume records.
    const result = computeOptimisticPr({ setType: 'working', weight: 100, reps: 6 }, currentBest);
    expect(result.isPr).toBe(true);
  });

  it('does not flag a PR for fewer-or-equal reps at the best weight', () => {
    const currentBest = makeCurrentBest({ best_weight: 100, best_weight_reps: 5, best_est_1rm: 200, best_set_volume: 900 });
    const result = computeOptimisticPr({ setType: 'working', weight: 100, reps: 5 }, currentBest);
    expect(result.isPr).toBe(false);
  });

  it('does not flag a reps-at-weight PR at a different weight than the cached best (client can\'t see that history)', () => {
    const currentBest = makeCurrentBest({ best_weight: 100, best_weight_reps: 5, best_est_1rm: 200, best_set_volume: 900 });
    // More reps (6) than best_weight_reps (5), but at 50kg, not the 100kg the record is cached for —
    // and not enough to beat weight/e1RM/volume either. This is genuinely a case the client can't see.
    const result = computeOptimisticPr({ setType: 'working', weight: 50, reps: 6 }, currentBest);
    expect(result.isPr).toBe(false);
  });

  it('treats a null currentBest (first time performing this exercise) as everything being a PR', () => {
    const result = computeOptimisticPr({ setType: 'working', weight: 40, reps: 8 }, null);
    expect(result.isPr).toBe(true);
  });
});

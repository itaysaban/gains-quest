import { computeLiveVolume } from '../session';
import { makeSessionExercise, makeLoggedSet } from '@/lib/testing/fixtures';

// PRD §6.1.4: "Warmup sets are excluded from PR detection, volume totals and points." This is a
// live, client-side approximation for Active Session's header — the authoritative total is computed
// server-side (fn_award_points_for_session) on completion.
describe('computeLiveVolume', () => {
  it('sums weight x reps across multiple exercises\' working sets', () => {
    const exercises = [
      makeSessionExercise({ sets: [makeLoggedSet({ weight: 100, reps: 5 }), makeLoggedSet({ weight: 100, reps: 5 })] }),
      makeSessionExercise({ sets: [makeLoggedSet({ weight: 50, reps: 10 })] }),
    ];
    // (100*5 + 100*5) + (50*10) = 1000 + 500 = 1500
    expect(computeLiveVolume(exercises)).toBe(1500);
  });

  it('excludes warmup sets from the total', () => {
    const exercises = [
      makeSessionExercise({
        sets: [makeLoggedSet({ set_type: 'warmup', weight: 40, reps: 10 }), makeLoggedSet({ set_type: 'working', weight: 100, reps: 5 })],
      }),
    ];
    expect(computeLiveVolume(exercises)).toBe(500);
  });

  it('treats a null reps as 1 and a null weight as 0, matching the server\'s coalesce() convention', () => {
    const exercises = [
      makeSessionExercise({
        sets: [makeLoggedSet({ weight: 80, reps: null }), makeLoggedSet({ weight: null, reps: 8 })],
      }),
    ];
    // (80 * 1) + (0 * 8) = 80
    expect(computeLiveVolume(exercises)).toBe(80);
  });

  it('returns 0 for a session with no logged sets yet', () => {
    const exercises = [makeSessionExercise({ sets: [] })];
    expect(computeLiveVolume(exercises)).toBe(0);
  });
});

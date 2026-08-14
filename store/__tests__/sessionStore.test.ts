jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { useSessionStore } from '../sessionStore';

const initialState = useSessionStore.getState();

describe('useSessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState(initialState, true);
  });

  it('starts with no active session', () => {
    expect(useSessionStore.getState().sessionId).toBeNull();
    expect(useSessionStore.getState().isPaused).toBe(false);
  });

  it('startSession sets the session/routine ids and resets timer state', () => {
    useSessionStore.getState().startSession('session-1', 'routine-1');
    const state = useSessionStore.getState();
    expect(state.sessionId).toBe('session-1');
    expect(state.routineId).toBe('routine-1');
    expect(state.isPaused).toBe(false);
    expect(state.pausedAccumulatedSeconds).toBe(0);
    expect(state.restTimer.isRunning).toBe(false);
  });

  it('endSession clears the session back to its initial shape', () => {
    useSessionStore.getState().startSession('session-1', 'routine-1');
    useSessionStore.getState().endSession();
    const state = useSessionStore.getState();
    expect(state.sessionId).toBeNull();
    expect(state.routineId).toBeNull();
    expect(state.startedAtMs).toBeNull();
  });

  it('elapsedSeconds counts up from session start', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    useSessionStore.getState().startSession('session-1', null);

    jest.spyOn(Date, 'now').mockReturnValue(1_010_000);
    expect(useSessionStore.getState().elapsedSeconds()).toBe(10);

    jest.restoreAllMocks();
  });

  it('elapsedSeconds excludes time spent paused', () => {
    // Base timestamp is deliberately non-zero: elapsedSeconds() early-returns via `if (!state.startedAtMs)`,
    // which would misfire on a startedAtMs of exactly 0 — never happens with a real Date.now(), but worth
    // knowing that guard uses a truthy check rather than a null check.
    jest.spyOn(Date, 'now').mockReturnValue(100_000);
    useSessionStore.getState().startSession('session-1', null);

    jest.spyOn(Date, 'now').mockReturnValue(105_000); // 5s in, pause
    useSessionStore.getState().pause();

    jest.spyOn(Date, 'now').mockReturnValue(115_000); // paused for 10s, resume
    useSessionStore.getState().resume();

    jest.spyOn(Date, 'now').mockReturnValue(120_000); // 5s more of active time
    // total wall clock 20s, minus 10s paused = 10s elapsed
    expect(useSessionStore.getState().elapsedSeconds()).toBe(10);

    jest.restoreAllMocks();
  });

  it('resume is a no-op on pausedAccumulatedSeconds if called while not paused', () => {
    jest.spyOn(Date, 'now').mockReturnValue(100_000);
    useSessionStore.getState().startSession('session-1', null);
    useSessionStore.getState().resume();
    expect(useSessionStore.getState().pausedAccumulatedSeconds).toBe(0);
    jest.restoreAllMocks();
  });

  it('setActiveSupersetGroup updates the active group id', () => {
    useSessionStore.getState().setActiveSupersetGroup('group-1');
    expect(useSessionStore.getState().activeSupersetGroupId).toBe('group-1');
    useSessionStore.getState().setActiveSupersetGroup(null);
    expect(useSessionStore.getState().activeSupersetGroupId).toBeNull();
  });

  describe('rest timer', () => {
    it('startRestTimer sets total seconds and an end timestamp', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      useSessionStore.getState().startRestTimer(90);
      const timer = useSessionStore.getState().restTimer;
      expect(timer.totalSeconds).toBe(90);
      expect(timer.endsAtMs).toBe(1_000_000 + 90_000);
      expect(timer.isRunning).toBe(true);
      jest.restoreAllMocks();
    });

    it('adjustRestTimer shifts the end time and clamps totalSeconds at 0', () => {
      jest.spyOn(Date, 'now').mockReturnValue(0);
      useSessionStore.getState().startRestTimer(20);

      useSessionStore.getState().adjustRestTimer(-30);
      const timer = useSessionStore.getState().restTimer;
      expect(timer.totalSeconds).toBe(0);
      expect(timer.endsAtMs).toBe(-10_000);
      jest.restoreAllMocks();
    });

    it('adjustRestTimer is a no-op when no timer is running', () => {
      useSessionStore.getState().stopRestTimer();
      useSessionStore.getState().adjustRestTimer(15);
      expect(useSessionStore.getState().restTimer.endsAtMs).toBeNull();
    });

    it('stopRestTimer resets the timer to idle', () => {
      useSessionStore.getState().startRestTimer(60);
      useSessionStore.getState().stopRestTimer();
      expect(useSessionStore.getState().restTimer).toEqual({ totalSeconds: 0, endsAtMs: null, isRunning: false });
    });
  });
});

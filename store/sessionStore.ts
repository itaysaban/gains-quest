import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface RestTimerState {
  totalSeconds: number;
  endsAtMs: number | null; // wall-clock end time, so the countdown survives the app being backgrounded
  isRunning: boolean;
}

interface SessionState {
  sessionId: string | null;
  routineId: string | null;
  startedAtMs: number | null;
  isPaused: boolean;
  pausedAccumulatedSeconds: number;
  pausedAtMs: number | null;
  activeSupersetGroupId: string | null;
  restTimer: RestTimerState;

  startSession: (sessionId: string, routineId: string | null) => void;
  endSession: () => void;
  pause: () => void;
  resume: () => void;
  setActiveSupersetGroup: (groupId: string | null) => void;
  startRestTimer: (seconds: number) => void;
  adjustRestTimer: (deltaSeconds: number) => void;
  stopRestTimer: () => void;
  elapsedSeconds: () => number;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      routineId: null,
      startedAtMs: null,
      isPaused: false,
      pausedAccumulatedSeconds: 0,
      pausedAtMs: null,
      activeSupersetGroupId: null,
      restTimer: { totalSeconds: 0, endsAtMs: null, isRunning: false },

      startSession: (sessionId, routineId) =>
        set({
          sessionId,
          routineId,
          startedAtMs: Date.now(),
          isPaused: false,
          pausedAccumulatedSeconds: 0,
          pausedAtMs: null,
          activeSupersetGroupId: null,
          restTimer: { totalSeconds: 0, endsAtMs: null, isRunning: false },
        }),

      endSession: () =>
        set({
          sessionId: null,
          routineId: null,
          startedAtMs: null,
          isPaused: false,
          pausedAccumulatedSeconds: 0,
          pausedAtMs: null,
          activeSupersetGroupId: null,
          restTimer: { totalSeconds: 0, endsAtMs: null, isRunning: false },
        }),

      pause: () => set({ isPaused: true, pausedAtMs: Date.now() }),

      resume: () =>
        set((state) => ({
          isPaused: false,
          pausedAtMs: null,
          pausedAccumulatedSeconds:
            state.pausedAccumulatedSeconds + (state.pausedAtMs ? Math.floor((Date.now() - state.pausedAtMs) / 1000) : 0),
        })),

      setActiveSupersetGroup: (groupId) => set({ activeSupersetGroupId: groupId }),

      startRestTimer: (seconds) =>
        set({ restTimer: { totalSeconds: seconds, endsAtMs: Date.now() + seconds * 1000, isRunning: true } }),

      adjustRestTimer: (deltaSeconds) =>
        set((state) => {
          if (!state.restTimer.endsAtMs) return state;
          return {
            restTimer: {
              ...state.restTimer,
              endsAtMs: state.restTimer.endsAtMs + deltaSeconds * 1000,
              totalSeconds: Math.max(0, state.restTimer.totalSeconds + deltaSeconds),
            },
          };
        }),

      stopRestTimer: () => set({ restTimer: { totalSeconds: 0, endsAtMs: null, isRunning: false } }),

      elapsedSeconds: () => {
        const state = get();
        if (!state.startedAtMs) return 0;
        const pausedNow = state.isPaused && state.pausedAtMs ? Math.floor((Date.now() - state.pausedAtMs) / 1000) : 0;
        return Math.floor((Date.now() - state.startedAtMs) / 1000) - state.pausedAccumulatedSeconds - pausedNow;
      },
    }),
    {
      name: 'gains-quest-session-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        sessionId: state.sessionId,
        routineId: state.routineId,
        startedAtMs: state.startedAtMs,
        isPaused: state.isPaused,
        pausedAccumulatedSeconds: state.pausedAccumulatedSeconds,
        pausedAtMs: state.pausedAtMs,
        activeSupersetGroupId: state.activeSupersetGroupId,
        restTimer: state.restTimer,
      }),
    },
  ),
);

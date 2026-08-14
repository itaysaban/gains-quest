import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

// Drives React Query's online/offline state from the device's actual connectivity, so mutations
// queue while the gym wifi is dead and flush automatically on reconnect instead of failing outright.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      networkMode: 'offlineFirst',
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: 3,
    },
  },
});

// Persists the cache (including queued mutations) across app kills — critical for an in-progress
// workout session surviving a dropped connection or a phone restart mid-gym-session.
export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'gains-quest-query-cache',
});

// By default the persister only dehydrates mutations that have already transitioned to `isPaused`
// (i.e. React Query already tried and failed once). A set logged the instant before a force-quit may
// never reach that state — it just never gets the chance to run. Persisting every mutation
// unconditionally means a genuinely offline-and-killed write still survives to be resumed.
export const persistOptions = {
  persister: asyncStoragePersister,
  maxAge: 1000 * 60 * 60 * 24 * 7,
  dehydrateOptions: {
    shouldDehydrateMutation: () => true,
  },
};

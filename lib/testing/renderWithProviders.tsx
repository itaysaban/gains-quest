import React from 'react';
import { act, render, type RenderOptions } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/auth/AuthProvider';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, networkMode: 'always' },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}

/**
 * Renders `ui` inside the real QueryClientProvider + AuthProvider — the same provider stack
 * `app/_layout.tsx` mounts — so hooks resolve `useAuth()`/`useQueryClient()` exactly as they do
 * in the app. Flushes one microtask tick so AuthProvider's `getSession()` (a mocked, already-resolved
 * promise) settles and `isLoading` flips to false before returning, since every M1/M2 hook under test
 * is gated on a resolved session. Callers still `waitFor` their own specific query/mutation outcomes.
 */
export async function renderWithProviders(ui: React.ReactElement, options: RenderOptions & { queryClient?: QueryClient } = {}) {
  const { queryClient = createTestQueryClient(), ...renderOptions } = options;

  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{ui}</AuthProvider>
      </QueryClientProvider>,
      renderOptions,
    );
    await Promise.resolve();
  });

  return { ...utils, queryClient };
}

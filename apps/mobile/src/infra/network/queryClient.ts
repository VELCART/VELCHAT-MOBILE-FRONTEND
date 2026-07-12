/**
 * TanStack Query client (§M5 server-state owner). Populated in later phases;
 * created here so the provider can wrap the app during MP0 bootstrap (§L2).
 * Offline-friendly defaults; the local DB (WatermelonDB) remains the UI source
 * of truth — Query only fills the DB, the UI observes the DB.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 0,
      networkMode: 'offlineFirst',
    },
  },
});

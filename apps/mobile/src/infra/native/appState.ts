/**
 * AppState wrapper (§M23, §M21). Thin typed interface over the native module.
 */
import { AppState, type AppStateStatus } from 'react-native';

export type { AppStateStatus };

export function getAppState(): AppStateStatus {
  return AppState.currentState;
}

/** Subscribe to app state transitions; returns an unsubscribe fn (§M20.3). */
export function subscribeAppState(
  cb: (status: AppStateStatus) => void,
): () => void {
  const sub = AppState.addEventListener('change', cb);
  return () => {
    sub.remove();
  };
}

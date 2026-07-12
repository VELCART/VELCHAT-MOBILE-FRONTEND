/**
 * Network info wrapper (§M23, §M21). Thin typed interface over the native module.
 * Drives network-awareness (offline-first, backoff, sync gating).
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export interface NetworkStatus {
  readonly connected: boolean;
  readonly type: string;
  /** true on metered/cellular connections (avoid large prefetch). */
  readonly expensive: boolean;
}

function toStatus(state: NetInfoState): NetworkStatus {
  const details = state.details as { isConnectionExpensive?: boolean } | null;
  return {
    connected: Boolean(state.isConnected),
    type: state.type,
    expensive: Boolean(details?.isConnectionExpensive),
  };
}

export async function getNetworkStatus(): Promise<NetworkStatus> {
  return toStatus(await NetInfo.fetch());
}

/** Subscribe to connectivity changes; returns an unsubscribe fn (owned + disposable, §M20.3). */
export function subscribeNetwork(cb: (status: NetworkStatus) => void): () => void {
  return NetInfo.addEventListener((state) => cb(toStatus(state)));
}

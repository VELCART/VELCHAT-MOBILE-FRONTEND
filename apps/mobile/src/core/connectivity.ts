/**
 * Connectivity state (§M13/§M21). Cross-cutting app state (core layer) so both the
 * network client (infra) and the UI (navigation) can read it. Two inputs decide
 * offline behaviour:
 *   - flightMode — the user's manual "go offline" toggle (header ✈️).
 *   - online     — real reachability from NetInfo (subscribeNetwork updates it).
 * The client blocks outbound requests while flightMode is on; the UI shows an offline
 * banner for either. Offline-first cached reads land with the chat/sync phase — this
 * is the switch + status those layers will read.
 */
import { create } from 'zustand';

interface ConnectivityState {
  /** user-toggled "airplane" mode — force the app offline. */
  readonly flightMode: boolean;
  /** real network reachability (NetInfo). */
  readonly online: boolean;
  setFlightMode: (on: boolean) => void;
  toggleFlightMode: () => void;
  setOnline: (on: boolean) => void;
}

export const useConnectivity = create<ConnectivityState>(set => ({
  flightMode: false,
  online: true,
  setFlightMode: on => set({ flightMode: on }),
  toggleFlightMode: () => set(s => ({ flightMode: !s.flightMode })),
  setOnline: on => set({ online: on }),
}));

/** True when the UI should present an offline state (manual flight mode OR no network). */
export function isOffline(): boolean {
  const { flightMode, online } = useConnectivity.getState();
  return flightMode || !online;
}

/** True only for the manual airplane toggle — the client uses this to block requests. */
export function isFlightMode(): boolean {
  return useConnectivity.getState().flightMode;
}

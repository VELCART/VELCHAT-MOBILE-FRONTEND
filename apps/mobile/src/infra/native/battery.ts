/**
 * Battery info wrapper (§M23). Thin typed interface over the native module so
 * the rest of the app never touches the library directly (swap impl behind this).
 * Used by battery-aware policies (§M21): e.g. cap call bitrate under 15%.
 */
import DeviceInfo from 'react-native-device-info';

export interface BatteryStatus {
  /** 0..1 */
  readonly level: number;
  readonly charging: boolean;
  readonly lowPowerMode: boolean;
}

export async function getBatteryStatus(): Promise<BatteryStatus> {
  const power = await DeviceInfo.getPowerState();
  const level = typeof power.batteryLevel === 'number' ? power.batteryLevel : await DeviceInfo.getBatteryLevel();
  return {
    level,
    charging: power.batteryState === 'charging' || power.batteryState === 'full',
    lowPowerMode: Boolean(power.lowPowerMode),
  };
}

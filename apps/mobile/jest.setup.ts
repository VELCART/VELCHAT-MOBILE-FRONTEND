/**
 * Global Jest setup (runs after the test framework is installed).
 *
 * Native modules absent under Jest are mocked here. @testing-library/react-native
 * auto-registers its matchers on import (no explicit extend-expect needed).
 */

// react-native-config's native module (RNCConfig) is null under Jest.
jest.mock('react-native-config', () => ({
  __esModule: true,
  default: {
    ENV: 'dev',
    API_BASE_URL: 'http://localhost:8080',
    WS_URL: 'ws://localhost:8080/ws',
  },
}));

// Encrypted MMKV — native module absent under Jest; in-memory stand-in.
jest.mock('react-native-mmkv', () => {
  const store = new Map<string, unknown>();
  class MMKV {
    getString(k: string): unknown {
      return store.get(k);
    }
    getBoolean(k: string): unknown {
      return store.get(k);
    }
    getNumber(k: string): unknown {
      return store.get(k);
    }
    set(k: string, v: unknown): void {
      store.set(k, v);
    }
    delete(k: string): void {
      store.delete(k);
    }
    getAllKeys(): string[] {
      return [...store.keys()];
    }
    clearAll(): void {
      store.clear();
    }
  }
  // Reactive hooks used by the profile mirror — a static read is enough for tests.
  const useMMKVString = (k: string): [unknown, (v: unknown) => void] => [
    store.get(k),
    (v: unknown) => store.set(k, v),
  ];
  return { MMKV, useMMKVString };
});

// react-native-image-crop-picker uses a TurboModule that is absent under Jest and
// throws at import; stand it in with a cancelled-picker default.
jest.mock('react-native-image-crop-picker', () => ({
  __esModule: true,
  default: {
    openPicker: jest.fn(() => Promise.reject({ code: 'E_PICKER_CANCELLED' })),
    openCamera: jest.fn(() => Promise.reject({ code: 'E_PICKER_CANCELLED' })),
    openCropper: jest.fn(() =>
      Promise.resolve({ path: '', mime: 'image/jpeg' }),
    ),
    clean: jest.fn(() => Promise.resolve()),
    cleanSingle: jest.fn(() => Promise.resolve()),
  },
}));

// Native BlurView is absent under Jest — stand it in with a plain host component.
jest.mock('@react-native-community/blur', () => ({ BlurView: 'BlurView' }));

// WatermelonDB's native SQLite adapter is absent under Jest — use LokiJS in-memory adapter.
jest.mock('@nozbe/watermelondb/adapters/sqlite', () => {
  const LokiJSAdapter = require('@nozbe/watermelondb/adapters/lokijs').default;
  return jest.fn().mockImplementation(
    (opts: { schema?: unknown; migrations?: unknown }) =>
      new LokiJSAdapter({
        schema: opts?.schema,
        migrations: opts?.migrations,
        useWebWorker: false,
        useIncrementalIndexedDB: false,
        // Loki's autosave is a 500ms setInterval that WatermelonDB turns on by default and only
        // ever clears on `loki.close()` — which the app never calls, because its database lives
        // for the life of the process. Under Jest that interval outlives the tests and holds the
        // worker's event loop open, so every DB-touching suite ended with "a worker process has
        // failed to exit gracefully" and hung ~100s past a run that had already finished
        // (VC-038). `--detectOpenHandles` never found it: the timer is created inside Loki's own
        // persistence callback, so it does not show up as a tracked handle.
        //
        // There is nothing to autosave here anyway — the adapter is in-memory and every run
        // starts from a fresh database. Production is untouched: this mock only replaces the
        // native SQLite adapter under Jest.
        extraLokiOptions: { autosave: false },
      }),
  );
});

// FlashList → a plain host component under Jest (native recycler view absent).
jest.mock('@shopify/flash-list', () => ({ FlashList: 'FlashList' }));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(() =>
      Promise.resolve({ isConnected: true, type: 'wifi', details: {} }),
    ),
    addEventListener: jest.fn(() => () => undefined),
  },
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getBatteryLevel: jest.fn(() => Promise.resolve(0.9)),
    isBatteryCharging: jest.fn(() => Promise.resolve(false)),
    getPowerState: jest.fn(() =>
      Promise.resolve({
        batteryLevel: 0.9,
        batteryState: 'unplugged',
        lowPowerMode: false,
      }),
    ),
  },
}));

// Gesture handler + Reanimated (ADR-0011). Both reach for native modules that do not exist
// under Jest, so both need a double here or every suite that renders a chat row fails to load.
//
// Gesture handler ships one. Reanimated 4 does not, usefully: `setUpTests()` and its own
// `mock.js` both pull in react-native-worklets, which throws on `loadUnpackersWithCode`
// before a single test runs because the worklets runtime is not installed. So this is a hand
// written double of exactly the surface the app uses — deliberately small, so that reaching
// for a new Reanimated API shows up here as a failing import rather than as silence.
//
// It is a BEHAVIOURAL double, not a no-op: a shared value really holds its value and
// `useAnimatedStyle` really calls its worklet, so a test can still assert on what a component
// computes. What it does not do is animate — there is no UI thread to animate on.
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native') as typeof import('react-native');
  const run = <T>(fn: (...a: unknown[]) => T) => fn;
  return {
    __esModule: true,
    // `createAnimatedComponent` is here because react-native-screens asks for it on import,
    // not because the chat uses it — a missing one takes down every navigation test.
    default: {
      View,
      Text: View,
      ScrollView: View,
      Image: View,
      createAnimatedComponent: (c: unknown) => c,
    },
    createAnimatedComponent: (c: unknown) => c,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useAnimatedReaction: () => undefined,
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    withSpring: (to: unknown) => to,
    withTiming: (to: unknown) => to,
    withDelay: (_d: number, to: unknown) => to,
    cancelAnimation: () => undefined,
    runOnJS: run,
    runOnUI: run,
    Easing: {
      linear: (v: number) => v,
      ease: (v: number) => v,
      out: (f: unknown) => f,
      in: (f: unknown) => f,
      quad: (v: number) => v,
    },
  };
});

// No real network in unit/component tests — loaders must fall back gracefully.
(globalThis as { fetch?: unknown }).fetch = jest.fn(() =>
  Promise.reject(new Error('network disabled in tests')),
);

export {};

# ADR-0003: `react-native-image-crop-picker` for avatar cropping

- **Status:** Accepted
- **Date:** 2026-08-01
- **Context refs:** §M1 (locked stack — new dependency needs an ADR), §M6, §B3/§B11 (profile + media), avatar flow in `features/user`.

## Context

Avatars are picked from the gallery and uploaded (`init → single PUT`, §B11). The
previous library, **`react-native-image-picker`**, only *selects* an image — it has no
cropping UI. Users could not frame a square/round avatar; the whole photo was uploaded
as-is, which looks unprofessional and wastes bytes. A proper WhatsApp/Instagram-style
**circular crop** was requested.

React Native ships no built-in image cropper, so a native module is required.

## Decision

Adopt **`react-native-image-crop-picker` (0.51.x)** and **remove
`react-native-image-picker`** (it is fully superseded — the only call site was the
avatar picker in `features/user/hooks/useProfile.ts`).

- The avatar flow calls `openPicker({ cropping: true, cropperCircleOverlay: true,
  width: 512, height: 512, forceJpg: true, compressImageQuality: 0.85 })` → a circular
  crop UI, normalised to a 512² JPEG.
- The module is **loaded lazily and guarded** (`loadCropPicker()`), because on the New
  Architecture it throws at *import* when its native side isn't in the binary yet
  (i.e. after adding the dep but before a rebuild). Guarding it means only the "pick
  photo" action fails softly ("please rebuild the app") instead of crashing every
  screen that imports the profile hook.
- Jest: the native TurboModule is absent under tests, so it is mocked in
  `jest.setup.ts` (returns a cancelled-picker), matching the mmkv/netinfo pattern.

## Consequences

- **Requires a native rebuild** (`pnpm android`) — a Metro reload is not enough for a
  new native module. This is a one-time cost after pulling this change.
- One extra native module in the build; `react-native-image-picker` is dropped, so the
  net native footprint is roughly flat.
- iOS: authored only (build deferred on this Windows machine, per project reality).
  When iOS is built, add `NSPhotoLibraryUsageDescription` (and, if camera capture is
  later enabled, `NSCameraUsageDescription`) to `Info.plist`.
- Android gallery + uCrop need no extra runtime permission (scoped storage / content
  resolver); camera capture is not used.

## Alternatives considered

- **Keep `react-native-image-picker` + a custom JS crop screen** — heavy to build, worse
  UX (gesture crop, zoom, circular mask are non-trivial), and still needs pan/zoom
  native performance. Rejected.
- **`expo-image-picker`** — pulls in Expo modules; not aligned with this bare RN app.
  Rejected.
- **No cropping (status quo)** — fails the product requirement. Rejected.

# ADR 0003 — react-native-image-picker for photo selection

- **Status:** Accepted
- **Date:** 2026-07-25
- **Context:** §M1 (locked stack), §B11 (media), §F1 (profile avatar).

## Context

The profile setup flow lets a user tap their avatar to set a photo. React Native has
no built-in gallery/camera picker, and hand-rolling a native module for this is not
worth it.

## Decision

Adopt **`react-native-image-picker`** — the de-facto RN picker — to select a photo
from the gallery. The picked file is uploaded through the existing media flow
(`POST /media/uploads` → multipart `PUT /media/uploads/:id`, §B11) and its `mediaId`
is attached to the directory profile as `avatarMediaId`.

## Rationale

- **Standard + maintained.** The community picker; handles Android 13+ Photo Picker
  and scoped storage for us.
- **Thin.** We only use `launchImageLibrary`; camera capture and cropping can be added
  behind the same call site later.
- **Fits the media contract.** Init→single-PUT already exists server-side; the picker
  just provides the bytes.

## Consequences

- Native rebuild after install; iOS needs `pod install` + `NSPhotoLibraryUsageDescription`
  in Info.plist (deferred to the Mac/CI build).
- Upload failures are surfaced but never block finishing the form — the default
  initial/person avatar simply stays.

---
'@velchat/mobile': minor
---

Profile & connectivity pass:

- WhatsApp-style **Profile page** (new screen): large avatar with camera badge + circular
  crop, inline-editable name/about, read-only phone/email/last-login rows.
- **Settings**: flat profile header that opens the Profile page + long-press **peek**
  popup (frosted-glass "water bubble" actions via a new `FrostedCircle`/`GlassBubble`),
  refined top-bar spacing, top-bar actions (search/scan/edit).
- **Welcome**: language selector pill → bottom-sheet dropdown (en/hi/ar).
- **Reactive profile mirror** — avatar/name update everywhere (header, Settings, Profile)
  the instant a photo is picked or a field saved (`useKVString`), offline-first.
- **Correctness**: normalize the user-service profile read (snake_case → camelCase) so
  name + avatar actually resolve; persist the phone on OTP verify and stamp `loginAt`;
  clear the mirrored profile on sign-out.
- **Media**: circular avatar crop via `react-native-image-crop-picker` (ADR-0003),
  real frosted-glass blur via `@react-native-community/blur` (ADR-0004).
- **Ops / connectivity**: point stage `WS_URL` at the realtime-gateway host; **warm the
  backend on app launch** so a hibernating free-tier service doesn't cause a cold-start
  timeout on first request.

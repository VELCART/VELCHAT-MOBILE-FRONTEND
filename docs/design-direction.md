# VelChat Mobile — Design Direction (v1)

> Source of the visual language for the whole app. Derived from a reference the user provided (2026-07-11): a clean, modern, iOS-native onboarding aesthetic. This doc is the input to the **MP0 design-system tokens** (`§M16`) and the **MP1 Welcome/onboarding screens** (`§F1`). It defines the *look*; the doc `VelChat-Mobile-Frontend-v1.md` defines the *behaviour*.

## 1. Aesthetic in one line
**Calm, premium, airy** — near-monochrome UI (black/white/gray) with generous whitespace, **bold heavy display headings**, **pill CTAs**, soft light-neumorphic elevation, playful **avatar motifs** (orbit ring + floating pastel avatars), and a single **signature brand gradient** (violet → pink) used sparingly for hero moments. Must feel native on iOS *and* Android, and read equally well in **light and dark**.

## 2. Principles
1. **Neutral-forward, accent-sparing.** UI is black/white/gray; colour appears only in avatars, status, and the hero gradient. Keeps it timeless at 1M+ scale and cheap to render.
2. **Type does the work.** Heavy display weights + tight tracking carry hierarchy; few colours needed.
3. **Soft depth, never heavy.** Light mode = diffuse low-opacity shadows. Dark mode = hairline borders + subtle surface tints + a faint brand glow (shadows don't read on dark).
4. **Motion is a garnish.** Gentle fade+scale entrances and a slow avatar float; always gated by `prefers-reduced-motion` / RN reduce-motion.
5. **Performance is a feature.** System fonts by default (zero bundle cost); avatars via FlashList + cached/optimised images; no heavy blur stacks on the render path (worst-device-first, `§M0`).

## 3. Tokens (feed `§M16` `design-system/tokens`)

### Colour — Light
| Token | Value |
|---|---|
| bg/base | `#FFFFFF` |
| bg/subtle | `#F7F7F8` |
| surface | `#FFFFFF` |
| surface/elevated | `#FFFFFF` (+ shadow) |
| border/hairline | `#ECECEE` |
| text/primary | `#0B0B0C` |
| text/secondary | `#8A8A8E` |
| text/tertiary | `#B0B0B5` |
| action/primary (CTA bg) | `#0B0B0C` → label `#FFFFFF` |

### Colour — Dark (derived; reference showed light only)
| Token | Value |
|---|---|
| bg/base | `#0A0A0B` |
| bg/subtle | `#121214` |
| surface | `#1A1A1C` |
| surface/elevated | `#232326` |
| border/hairline | `#2A2A2E` |
| text/primary | `#F5F5F7` |
| text/secondary | `#9A9AA1` |
| text/tertiary | `#6E6E75` |
| action/primary (CTA bg) | `#FFFFFF` → label `#0B0B0C` (inverts to stay primary) |

### Brand + pastels (both modes)
- **Signature gradient:** light `#7C5CFC → #FF6FB5`; dark `#6E4BF0 → #E85CA0` (used for hero glow, avatar rings, highlights — sparingly).
- **Avatar pastels:** mint `#C9F2D6`, pink `#FFD3E6`, blue `#CFE3FF`, yellow `#FFEFB0`, peach `#FFE0C7`, lavender `#E5DBFF` (chip backgrounds / placeholder initials). Dark mode uses the same hues at ~22% opacity over surface.
- **Semantic:** success `#34C759`, warning `#FF9F0A`, danger `#FF3B30`, info `#0A84FF` (tuned per mode).

### Typography (system stack: SF Pro / Roboto; optional bundled Inter Variable — decision at MP0)
| Role | Size / line | Weight | Tracking |
|---|---|---|---|
| Display | 34 / 40 | 800 | -0.02em |
| Title | 24 / 30 | 700 | -0.01em |
| Body | 16 / 24 | 400–500 | 0 |
| Label (button) | 17 / 20 | 600 | 0 |
| Caption | 13 / 18 | 500 | 0 |

### Radius / spacing / elevation / motion
- **Radius:** xs 8, sm 12, md 16, **lg 20 (cards)**, xl 28, **pill 999**. People avatars = circle; grouped tiles = squircle ~22.
- **Spacing (4-base):** 4 8 12 16 20 24 32 40 48 64.
- **Elevation (light):** e1 `0 2px 8px rgba(0,0,0,.06)`, e2 `0 8px 24px rgba(0,0,0,.08)`, e3 `0 16px 40px rgba(0,0,0,.10)`. **Dark:** border/hairline + surface tint + optional brand glow.
- **Motion:** entrance fade+scale `.96→1` 260ms ease-out; avatar float 6s loop ±4px; reduce-motion → static.

## 4. Signature components (built in MP0, used in MP1)
- **PillButton** — h56, radius 999, full-width; primary = high-contrast (black on light / white on dark), label 17/600 inverted; active scale .98; loading + disabled states.
- **GhostButton / TextAction** — transparent, text/secondary (e.g. "Another time").
- **AvatarOrbit** — central circular avatar + ring of squircle avatars at varying sizes with concentric faint rings behind (the "Inspired people" motif) → VelChat: "people you'll talk to".
- **FloatingAvatarCluster** — scattered circular pastel avatars with tiny status badges (the notifications screen motif).
- **NotificationCard** — translucent surface, radius 20, avatar + title(semibold) + subtitle(secondary) + timestamp(caption, top-right).
- **Heading + Subhead block** — centered display + secondary subtitle.

## 5. How the reference maps to VelChat's real onboarding (`§F1`)
The reference is a generic social app; we adopt its **style**, not its content. Mapping:
- "Inspired people" hero → **Welcome to VelChat** (AvatarOrbit motif) → CTA "Get started".
- "Don't miss out…" screen → **notification-permission** onboarding step → CTA "Turn on notifications" + text-action "Maybe later".
- Real `§F1` flow underneath is unchanged: Welcome → EnterPhone → ReverseOTP → LinkPasskey → NameYou.

## 6. Non-negotiables carried from the app mandate
- WCAG AA contrast in both modes (AAA on body); 44×44 min touch targets (`§M18`).
- No layout that breaks at 200% dynamic type; RTL-safe (logical spacing, mirrored directional icons).
- Every visual affordance has light + dark + reduce-motion + RTL states.

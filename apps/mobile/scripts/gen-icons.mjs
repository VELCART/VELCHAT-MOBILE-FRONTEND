// Generates Android launcher icons + splash foreground from brand/logo.png (§M24).
// The VelChat logo (green chat bubbles, transparent bg) is trimmed to its bounds
// and centered on a WHITE field so it fills the icon. Produces legacy PNGs (all
// densities) + an adaptive icon (white background + logo foreground) for API 26+.
// The adaptive foreground doubles as the Android-12 splash icon.
//
// Usage: pnpm --filter @velchat/mobile icons   (after saving brand/logo.png)
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repoRoot = path.resolve(appRoot, '..', '..');
const SRC = path.join(repoRoot, 'brand', 'logo.png');
const RES = path.join(appRoot, 'android', 'app', 'src', 'main', 'res');
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

// Legacy launcher px per density; adaptive foreground is 108dp (2.25x the legacy 48).
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ADAPTIVE = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

async function trimmedLogo() {
  // Trim the transparent border to a tight logo, keep alpha.
  return sharp(SRC).ensureAlpha().trim({ threshold: 10 }).toBuffer();
}

async function onField(logo, size, coverage, background) {
  const inner = Math.round(size * coverage);
  const resized = await sharp(logo)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .toBuffer();
  const pad = Math.round((size - inner) / 2);
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: resized, top: pad, left: pad }])
    .png()
    .toBuffer();
}

async function circleMask(square, size) {
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  return sharp(square)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function main() {
  const logo = await trimmedLogo();
  for (const [density, px] of Object.entries(LEGACY)) {
    const dir = path.join(RES, `mipmap-${density}`);
    mkdirSync(dir, { recursive: true });
    const square = await onField(logo, px, 0.86, WHITE); // full-bleed logo, small white margin
    writeFileSync(path.join(dir, 'ic_launcher.png'), square);
    writeFileSync(
      path.join(dir, 'ic_launcher_round.png'),
      await circleMask(square, px),
    );
    // Adaptive/splash foreground: logo on transparent (system draws the bg + mask).
    const fg = await onField(logo, ADAPTIVE[density], 0.72, TRANSPARENT);
    writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fg);
  }

  // Adaptive icon (API 26+): white background + logo foreground.
  const v26 = path.join(RES, 'mipmap-anydpi-v26');
  mkdirSync(v26, { recursive: true });
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  writeFileSync(path.join(v26, 'ic_launcher.xml'), adaptiveXml);
  writeFileSync(path.join(v26, 'ic_launcher_round.xml'), adaptiveXml);

  const valuesDir = path.join(RES, 'values');
  mkdirSync(valuesDir, { recursive: true });
  writeFileSync(
    path.join(valuesDir, 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n`,
  );

  console.log(
    'OK  launcher icons + splash foreground generated from brand/logo.png (rebuild to see them).',
  );
}

main().catch(e => {
  console.error('FAIL icon generation:', e.message);
  process.exit(1);
});

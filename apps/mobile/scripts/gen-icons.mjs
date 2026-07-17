// Generates Android launcher icons from brand/logo.png (§M24).
// Full-bleed, no-gap: the cat is trimmed to its bounds and centered on a black
// field so it fills the icon. Produces legacy PNGs (all densities) + an adaptive
// icon (black background + cat foreground) for API 26+.
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
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };

// Legacy launcher px per density; adaptive foreground is 108dp (2.25x the legacy 48).
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ADAPTIVE = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

async function trimmedCat() {
  // Trim the uniform black border to get a tight cat, keep alpha.
  return sharp(SRC).ensureAlpha().trim({ threshold: 10 }).toBuffer();
}

async function onField(cat, size, coverage, background) {
  const inner = Math.round(size * coverage);
  const resized = await sharp(cat)
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
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
  const cat = await trimmedCat();
  for (const [density, px] of Object.entries(LEGACY)) {
    const dir = path.join(RES, `mipmap-${density}`);
    mkdirSync(dir, { recursive: true });
    const square = await onField(cat, px, 0.82, BLACK); // 82% cat, small black margin
    writeFileSync(path.join(dir, 'ic_launcher.png'), square);
    writeFileSync(
      path.join(dir, 'ic_launcher_round.png'),
      await circleMask(square, px),
    );
    const fg = await onField(cat, ADAPTIVE[density], 0.66, {
      r: 0,
      g: 0,
      b: 0,
      alpha: 0,
    });
    writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fg);
  }

  // Adaptive icon (API 26+): black background + cat foreground.
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
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#000000</color>\n</resources>\n`,
  );

  console.log(
    'OK  launcher icons generated from brand/logo.png (rebuild to see them).',
  );
}

main().catch(e => {
  console.error('FAIL icon generation:', e.message);
  process.exit(1);
});

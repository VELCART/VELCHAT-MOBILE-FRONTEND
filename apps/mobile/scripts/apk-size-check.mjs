// APK-size gate (§M0.2 / §R4): arm64 base APK must be <= 45 MB.
// Runs after `gradlew assembleDebug`/`assembleRelease`. Debug builds are often
// universal (all ABIs) so we prefer an arm64-split APK when present; otherwise
// we report the universal size informationally and only hard-fail an arm64 one.
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const LIMIT_MB = 45;
const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outDir = path.join(appRoot, 'android', 'app', 'build', 'outputs', 'apk');

function walk(dir) {
  let files = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files = files.concat(walk(p));
    else if (e.name.endsWith('.apk')) files.push(p);
  }
  return files;
}

let apks = [];
try {
  apks = walk(outDir);
} catch {
  console.error(`No APK output dir at ${outDir} — build first.`);
  process.exit(1);
}
if (apks.length === 0) {
  console.error('No .apk found.');
  process.exit(1);
}

const arm64 = apks.filter(f => /arm64/i.test(f));
const targets = arm64.length ? arm64 : apks;
let failed = false;
for (const f of targets) {
  const mb = statSync(f).size / (1024 * 1024);
  const isArm64 = /arm64/i.test(f);
  const verdict = isArm64 && mb > LIMIT_MB ? 'FAIL' : 'ok';
  if (verdict === 'FAIL') failed = true;
  console.log(
    `${verdict.padEnd(4)} ${mb.toFixed(1)} MB  ${path.basename(f)}${isArm64 ? '' : '  (not ABI-split; informational)'}`,
  );
}
process.exit(failed ? 1 : 0);

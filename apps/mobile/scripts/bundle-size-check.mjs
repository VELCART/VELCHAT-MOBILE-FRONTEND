// JS bundle-size gate (§M0.2 / §R4): production JS bundle must be <= 6 MB.
import { execSync } from 'node:child_process';
import { statSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const LIMIT_MB = 6;
const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const tmp = mkdtempSync(path.join(os.tmpdir(), 'velchat-bundle-'));
const out = path.join(tmp, 'index.android.bundle');

execSync(
  `npx react-native bundle --platform android --dev false --entry-file index.js ` +
    `--bundle-output "${out}" --assets-dest "${tmp}"`,
  { cwd: appRoot, stdio: 'inherit' },
);

const mb = statSync(out).size / (1024 * 1024);
console.log(`JS bundle: ${mb.toFixed(2)} MB  (limit ${LIMIT_MB} MB)`);
process.exit(mb <= LIMIT_MB ? 0 : 1);

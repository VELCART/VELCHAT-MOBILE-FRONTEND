// Proves the §M4 layer-boundary lint actually fails on a violation (MBOOT-0 DoD).
// Writes a temp file containing an illegal import, runs eslint on it, asserts eslint rejects
// it, then removes the probe.
//
// THE PROBE MUST USE AN EDGE THE CONFIG ACTUALLY FORBIDS. It used to probe `domain -> infra`,
// which `.eslintrc.js` allows on purpose — the SyncEngine orchestrates infra, and the rule says
// so in a comment right beside the allowance. So the gate could only ever fail, and a gate that
// always fails is a gate nobody reads: it stopped saying anything about whether the boundary
// plugin was wired at all.
//
// `features/*/ui -> infra` is the edge this probes now, and it is a real one: it fired during
// MP2 when the chat screen reached for `getMessagesByIds` directly, which is exactly the mistake
// the gate exists to keep catching. UI goes through the feature's own hooks/api.
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
// Inside an existing feature's `ui` folder, because the rule is matched on the folder pattern
// `src/features/*/ui` — a probe anywhere else is simply a different element type.
const probeDir = path.join(appRoot, 'src', 'features', 'chat', 'ui');
const probe = path.join(probeDir, '__boundary_probe__.ts');

mkdirSync(probeDir, { recursive: true });
writeFileSync(
  probe,
  [
    '// TEMP probe (auto-generated). features/*/ui -> infra is a §M4 violation.',
    "import '../../../infra';",
    'export {};',
    '',
  ].join('\n'),
);

let caught = false;
let output = '';
try {
  execSync(`npx eslint "${probe}" --no-ignore`, {
    cwd: appRoot,
    stdio: 'pipe',
  });
} catch (e) {
  output = `${e.stdout?.toString() ?? ''}${e.stderr?.toString() ?? ''}`;
  caught = /boundaries\/element-types|boundaries/.test(output);
}
rmSync(probe, { force: true });

if (caught) {
  console.log(
    'OK  boundary gate works: a features/*/ui -> infra import was rejected by eslint.',
  );
  process.exit(0);
}
console.error(
  'FAIL  boundary gate did not reject a features/*/ui -> infra import.\n',
  output,
);
process.exit(1);

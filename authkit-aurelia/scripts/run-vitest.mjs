import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Runs Vitest, mirroring the package into a temporary directory first when the
 * checkout path contains URL-special characters ("#", "?" or "%").
 *
 * Vite treats "#" as a URL fragment, so a checkout under ".../Dev/C#/..." cannot
 * be served by its module runner. The mirror keeps `npm test` working from such
 * a path without changing how the package is tested anywhere else.
 */
const projectRoot = process.cwd();
const MIRRORED_ENTRIES = [
  'package.json',
  'tsconfig.json',
  'tsconfig.test.json',
  'vitest.config.ts',
  'src',
  'test',
  'node_modules',
];

function runVitest(cwd, args) {
  const cli = join(cwd, 'node_modules', 'vitest', 'vitest.mjs');
  const result = spawnSync(process.execPath, [cli, 'run', ...args], {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  return result.status ?? 1;
}

if (!/[#?%]/.test(projectRoot)) {
  process.exit(runVitest(projectRoot, process.argv.slice(2)));
}

const mirror = mkdtempSync(join(tmpdir(), 'authkit-aurelia-vitest-'));

try {
  for (const entry of MIRRORED_ENTRIES) {
    cpSync(join(projectRoot, entry), join(mirror, entry), { recursive: true });
  }
  process.exitCode = runVitest(mirror, process.argv.slice(2));
} finally {
  rmSync(mirror, { recursive: true, force: true });
}

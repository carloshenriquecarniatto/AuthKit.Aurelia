import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copies the canonical contract from AuthKit.Net into this repository.
 *
 * AuthKit.Net owns `contracts/authkit.contract.json`; both packages share this committed copy, and
 * CI downloads the canonical file from `main` to detect drift.
 *
 * ```bash
 * node scripts/sync-contract.mjs            # from ../AuthKit.Net
 * node scripts/sync-contract.mjs --remote   # from raw.githubusercontent.com
 * ```
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'contracts', 'authkit.contract.json');
const remote =
  'https://raw.githubusercontent.com/carloshenriquecarniatto/AuthKit.Net/main/contracts/authkit.contract.json';

async function load() {
  if (process.argv.includes('--remote')) {
    const response = await fetch(remote);
    if (!response.ok) {
      throw new Error(`could not download the canonical contract: HTTP ${response.status}`);
    }
    return response.text();
  }

  const netRoot = process.env.AUTHKIT_NET_ROOT ?? join(root, '..', 'AuthKit.Net');
  return readFile(join(netRoot, 'contracts', 'authkit.contract.json'), 'utf8');
}

const canonical = await load();
let current = null;
try {
  current = await readFile(target, 'utf8');
} catch {
  current = null;
}

if (current === canonical) {
  console.log('sync-contract: the local copy is up to date.');
} else {
  await writeFile(target, canonical);
  console.log('sync-contract: updated contracts/authkit.contract.json.');
  console.log('sync-contract: update the TypeScript declarations in the same change.');
}

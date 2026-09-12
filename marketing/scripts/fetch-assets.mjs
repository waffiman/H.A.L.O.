// Downloads every Figma asset listed in assets.manifest.json into src/assets/.
// Figma's /api/mcp/asset/ URLs expire ~7 days after extraction, so the bytes
// must live in the repo. Re-run after a fresh extraction refreshes the manifest.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'assets.manifest.json');
const outDir = path.join(root, 'src/assets');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
await mkdir(outDir, { recursive: true });

const force = process.argv.includes('--force');
let ok = 0, skipped = 0, failed = 0;

for (const [name, url] of Object.entries(manifest)) {
  const dest = path.join(outDir, name);
  if (existsSync(dest) && !force) { skipped++; continue; }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`  ok   ${name}`);
    ok++;
  } catch (err) {
    console.error(`  FAIL ${name} — ${err.message} (URL likely expired; re-extract)`);
    failed++;
  }
}
console.log(`\n${ok} downloaded, ${skipped} already present, ${failed} failed`);
if (failed) process.exitCode = 1;

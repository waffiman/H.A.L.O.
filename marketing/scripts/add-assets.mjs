// Merge `name=url` pairs into assets.manifest.json, then download the new ones.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const p = path.join(root, 'assets.manifest.json');
const m = JSON.parse(await readFile(p, 'utf8'));
for (const arg of process.argv.slice(2)) {
  const i = arg.indexOf('=');
  if (i < 0) { console.error(`skip (no =): ${arg}`); continue; }
  m[arg.slice(0, i)] = arg.slice(i + 1);
}
await writeFile(p, JSON.stringify(Object.fromEntries(Object.entries(m).sort()), null, 2) + '\n');
console.log(`manifest now has ${Object.keys(m).length} assets`);

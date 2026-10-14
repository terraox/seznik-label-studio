/**
 * Fail loudly when a patches/*.patch file is not applied to node_modules.
 * patch-package can be skipped silently (install with --ignore-scripts, a package
 * re-extracted after patching), and a native build from stock sources then ships
 * without the patch. Every added line of each patch must be present in its target file.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const patchDir = path.join(root, 'patches');

function addedLinesByFile(patchText) {
  const files = new Map();
  let current = null;
  for (const line of patchText.split('\n')) {
    if (line.startsWith('+++ b/')) {
      current = line.slice('+++ b/'.length).trim();
      files.set(current, []);
    } else if (current && line.startsWith('+') && !line.startsWith('+++')) {
      const added = line.slice(1).trim();
      if (added) files.get(current).push(added);
    }
  }
  return files;
}

const problems = [];
const patches = (await readdir(patchDir)).filter((name) => name.endsWith('.patch')).sort();
for (const patch of patches) {
  const files = addedLinesByFile(await readFile(path.join(patchDir, patch), 'utf8'));
  for (const [file, added] of files) {
    let content;
    try {
      content = await readFile(path.join(root, file), 'utf8');
    } catch {
      problems.push(`${patch}: ${file} is missing`);
      continue;
    }
    const present = new Set(content.split('\n').map((line) => line.trim()));
    const missing = added.filter((line) => !present.has(line));
    if (missing.length > 0) {
      problems.push(`${patch}: ${file} lacks ${missing.length} patched line(s), e.g. "${missing[0]}"`);
    }
  }
}

if (problems.length > 0) {
  console.error('Patches are NOT applied to node_modules:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('Run: npx patch-package   (then rebuild the native app)');
  process.exit(1);
}
console.log(`verify-patches: ${patches.length} patch file(s) applied.`);

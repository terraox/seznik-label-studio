import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const ROOT = join(__dirname, '..', '..', '..', '..');
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx$/.test(name) ? [path] : [];
  });
}

/** The opening <Modal ...> tag, up to the first '>' that closes it. */
function modalTags(source: string): string[] {
  const tags: string[] = [];
  const re = /<Modal[\s>]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let depth = 0;
    let i = m.index + 1;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) break;
    }
    tags.push(source.slice(m.index, i + 1));
  }
  return tags;
}

test('every Modal can rotate (iOS shows a Modal in portrait only by default)', () => {
  const missing: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const tag of modalTags(source)) {
      if (!/supportedOrientations=\{ALL_ORIENTATIONS\}/.test(tag)) {
        missing.push(`${relative(ROOT, file)}: ${tag.split('\n')[0]}`);
      }
    }
  }
  assert.deepEqual(missing, [], 'Add supportedOrientations={ALL_ORIENTATIONS} from @/lib/layout/screen-sizes');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONVERTED_FILES } from './theme-files';

const ROOT = join(__dirname, '..', '..', '..');

/** Hex, rgb()/rgba(), and the named colours people reach for. `transparent` is allowed. */
const COLOR_LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\(|['"](?:white|black|red|green|blue|gray|grey)['"]|\bPalette\.|(?<![.\w])accentStrong\b|\bHomeStatusColors\b/;

function offendingLines(source: string): string[] {
  return source
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => !line.includes('theme-fixed'))
    .filter(({ line }) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .filter(({ line }) => COLOR_LITERAL.test(line))
    .map(({ line, n }) => `${n}: ${line.trim()}`);
}

test('converted files contain no hard-coded colours', () => {
  const failures: string[] = [];
  for (const file of CONVERTED_FILES) {
    const lines = offendingLines(readFileSync(join(ROOT, file), 'utf8'));
    for (const l of lines) failures.push(`${file}:${l}`);
  }
  assert.deepEqual(failures, [], `Use a theme token (or mark the line // theme-fixed: why):\n${failures.join('\n')}`);
});

test('the detector catches the usual forms', () => {
  assert.equal(offendingLines(`color: '#FFF',`).length, 1);
  assert.equal(offendingLines(`backgroundColor: 'rgba(0,0,0,0.4)',`).length, 1);
  assert.equal(offendingLines(`tintColor="white"`).length, 1);
  assert.equal(offendingLines(`color: c.text,`).length, 0);
  assert.equal(offendingLines(`backgroundColor: 'transparent',`).length, 0);
  assert.equal(offendingLines(`fill="#000" // theme-fixed: label ink`).length, 0);
  assert.equal(offendingLines(`color: Palette.ink,`).length, 1);
});

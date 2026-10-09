import assert from 'node:assert/strict';
import test from 'node:test';

import { splitPrintTextSegments } from '@/lib/text/emoji-segments';

test('splitPrintTextSegments keeps text and emoji runs', () => {
  assert.deepEqual(splitPrintTextSegments('Hi'), [{ kind: 'text', value: 'Hi' }]);
  const mixed = splitPrintTextSegments('Ship 🚢 now');
  assert.equal(mixed.length, 3);
  assert.equal(mixed[0].kind, 'text');
  assert.equal(mixed[1].kind, 'emoji');
  assert.equal(mixed[1].value, '🚢');
  assert.equal(mixed[2].value, ' now');
});

test('splitPrintTextSegments keeps smiling face with horns', () => {
  const parts = splitPrintTextSegments('Hi 😈');
  assert.equal(parts.some((part) => part.kind === 'emoji' && part.value.includes('😈')), true);
});

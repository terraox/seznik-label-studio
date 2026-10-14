import assert from 'node:assert/strict';
import test from 'node:test';

import { copyOcrText } from '@/lib/ocr/copy-text';
import { OcrError } from '@/lib/ocr/errors';

test('copy writes trimmed recognized text to the clipboard', async () => {
  const calls: string[] = [];
  await copyOcrText('  SKU-4412  ', {
    setStringAsync: async (text) => {
      calls.push(text);
    },
  });
  assert.deepEqual(calls, ['SKU-4412']);
});

test('copy of empty text throws no_text', async () => {
  await assert.rejects(
    () => copyOcrText('   ', { setStringAsync: async () => {} }),
    (error: unknown) => error instanceof OcrError && error.code === 'no_text',
  );
});

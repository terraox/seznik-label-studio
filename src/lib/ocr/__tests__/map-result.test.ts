import assert from 'node:assert/strict';
import test from 'node:test';

import { OcrError } from '@/lib/ocr/errors';
import { mapNativeOcrResult, mapOcrFrame } from '@/lib/ocr/map-result';

test('maps native blocks and lines without inventing confidence', () => {
  const result = mapNativeOcrResult(
    {
      text: 'SKU-4412\n$12.50',
      blocks: [
        {
          text: 'SKU-4412\n$12.50',
          frame: { left: 10, top: 20, width: 100, height: 40 },
          lines: [
            { text: 'SKU-4412', frame: { left: 10, top: 20, width: 100, height: 18 } },
            { text: '$12.50', frame: { left: 10, top: 40, width: 80, height: 18 } },
          ],
        },
      ],
    },
    { width: 800, height: 600 },
  );

  assert.equal(result.text, 'SKU-4412\n$12.50');
  assert.equal(result.blocks.length, 1);
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[0]?.text, 'SKU-4412');
  assert.equal(result.lines[1]?.text, '$12.50');
  assert.deepEqual(result.imageSize, { width: 800, height: 600 });
  assert.deepEqual(result.blocks[0]?.frame, { left: 10, top: 20, width: 100, height: 40 });
  assert.equal('confidence' in result, false);
  assert.equal('confidence' in (result.blocks[0] ?? {}), false);
});

test('scales bounding boxes back to the source image size', () => {
  const frame = mapOcrFrame({ left: 10, top: 20, width: 40, height: 10 }, 2);
  assert.deepEqual(frame, { left: 20, top: 40, width: 80, height: 20 });
});

test('omits bounding boxes that the engine did not provide', () => {
  const result = mapNativeOcrResult(
    {
      text: 'HELLO',
      blocks: [{ text: 'HELLO', lines: [{ text: 'HELLO' }] }],
    },
    { width: 100, height: 40 },
  );

  assert.equal(result.blocks[0]?.frame, undefined);
  assert.equal(result.lines[0]?.frame, undefined);
});

test('empty recognition throws no_text', () => {
  assert.throws(
    () => mapNativeOcrResult({ text: '   ', blocks: [] }, { width: 10, height: 10 }),
    (error: unknown) => error instanceof OcrError && error.code === 'no_text',
  );
});

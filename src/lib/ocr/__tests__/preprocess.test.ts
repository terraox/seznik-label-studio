import assert from 'node:assert/strict';
import test from 'node:test';

import { OcrError } from '@/lib/ocr/errors';
import { assertRecognizableImageUri } from '@/lib/ocr/image-uri';
import { OCR_MAX_EDGE_PX, ocrWorkingSize } from '@/lib/ocr/working-size';

test('small images pass through without downscaling', () => {
  const size = ocrWorkingSize(1200, 800);
  assert.equal(size.downscaled, false);
  assert.equal(size.widthPx, 1200);
  assert.equal(size.heightPx, 800);
});

test('images above the max edge are downscaled proportionally', () => {
  const size = ocrWorkingSize(4096, 2048);
  assert.equal(size.downscaled, true);
  assert.equal(size.widthPx, OCR_MAX_EDGE_PX);
  assert.equal(size.heightPx, 1024);
});

test('empty and data URIs are rejected', () => {
  assert.throws(
    () => assertRecognizableImageUri('  '),
    (error: unknown) => error instanceof OcrError && error.code === 'invalid_image',
  );
  assert.throws(
    () => assertRecognizableImageUri('data:image/png;base64,aaaa'),
    (error: unknown) => error instanceof OcrError && error.code === 'unsupported_format',
  );
});

test('unsupported file extensions are rejected and jpeg is accepted', () => {
  assert.throws(
    () => assertRecognizableImageUri('file:///tmp/label.pdf'),
    (error: unknown) => error instanceof OcrError && error.code === 'unsupported_format',
  );
  assert.equal(assertRecognizableImageUri('file:///tmp/label.jpg'), 'file:///tmp/label.jpg');
  assert.equal(
    assertRecognizableImageUri('content://media/external/images/media/12'),
    'content://media/external/images/media/12',
  );
});

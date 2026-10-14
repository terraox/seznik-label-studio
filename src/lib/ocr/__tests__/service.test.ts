import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import { OcrError } from '@/lib/ocr/errors';
import { recognizeImage, resetOcrInFlightForTests } from '@/lib/ocr/service';
import type { OcrEngine, OcrImageSize, OcrRecognizeDeps, PreparedOcrImage } from '@/lib/ocr/types';

function createDeps(engine: OcrEngine, extras?: Partial<OcrRecognizeDeps>): OcrRecognizeDeps {
  return {
    engine,
    inspectImage: async (): Promise<OcrImageSize> => ({ width: 800, height: 400 }),
    prepareImage: async (uri, size): Promise<PreparedOcrImage> => ({
      uri,
      width: size.width,
      height: size.height,
      temporary: false,
    }),
    cleanupPreparedImage: async () => {},
    ...extras,
  };
}

beforeEach(() => {
  resetOcrInFlightForTests();
});

test('recognizeImage returns structured text from a fake engine', async () => {
  const result = await recognizeImage(
    'file:///tmp/label.png',
    createDeps({
      recognize: async () => ({
        text: 'WIDGET A\nSN-9981',
        blocks: [
          {
            text: 'WIDGET A\nSN-9981',
            lines: [{ text: 'WIDGET A' }, { text: 'SN-9981' }],
          },
        ],
      }),
    }),
  );

  assert.equal(result.text, 'WIDGET A\nSN-9981');
  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[1]?.text, 'SN-9981');
  assert.deepEqual(result.imageSize, { width: 800, height: 400 });
});

test('empty engine output becomes no_text', async () => {
  await assert.rejects(
    () =>
      recognizeImage(
        'file:///tmp/blank.png',
        createDeps({
          recognize: async () => ({ text: '', blocks: [] }),
        }),
      ),
    (error: unknown) => error instanceof OcrError && error.code === 'no_text',
  );
});

test('missing image URI is invalid_image', async () => {
  await assert.rejects(
    () =>
      recognizeImage(
        ' ',
        createDeps({
          recognize: async () => ({ text: 'nope', blocks: [] }),
        }),
      ),
    (error: unknown) => error instanceof OcrError && error.code === 'invalid_image',
  );
});

test('in-flight guard does not start a second engine run', async () => {
  let started = 0;
  let release: ((value: { text: string; blocks: never[] }) => void) | undefined;
  const engine: OcrEngine = {
    recognize: () => {
      started += 1;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  };
  const deps = createDeps(engine);

  const first = recognizeImage('file:///tmp/a.jpg', deps);
  for (let i = 0; i < 30 && started === 0; i += 1) {
    await Promise.resolve();
  }
  const second = recognizeImage('file:///tmp/a.jpg', deps);

  assert.equal(started, 1);
  assert.ok(release);
  release({ text: 'ONCE', blocks: [] });

  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.text, 'ONCE');
  assert.equal(b.text, 'ONCE');
  assert.equal(started, 1);
});

test('prepareImage is used and temporary files are cleaned up', async () => {
  const cleaned: string[] = [];
  const recognizedUris: string[] = [];

  await recognizeImage(
    'file:///tmp/huge.jpg',
    createDeps(
      {
        recognize: async (uri) => {
          recognizedUris.push(uri);
          return { text: 'OK', blocks: [{ text: 'OK', lines: [{ text: 'OK' }] }] };
        },
      },
      {
        inspectImage: async () => ({ width: 4096, height: 2048 }),
        prepareImage: async () => ({
          uri: 'file:///tmp/huge-small.jpg',
          width: 2048,
          height: 1024,
          temporary: true,
        }),
        cleanupPreparedImage: async (prepared) => {
          cleaned.push(prepared.uri);
        },
      },
    ),
  );

  assert.deepEqual(recognizedUris, ['file:///tmp/huge-small.jpg']);
  assert.deepEqual(cleaned, ['file:///tmp/huge-small.jpg']);
});

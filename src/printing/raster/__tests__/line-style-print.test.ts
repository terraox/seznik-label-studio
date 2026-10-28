import assert from 'node:assert/strict';
import test from 'node:test';

import type { LabelDocument } from '@/lib/label-document';
import { LINE_STYLE_IDS } from '@/lib/line-pattern';
import { td404ContentShiftDots, td404EdgeBorderOptions } from '@/lib/printer/print-spec';
import { rasterizeDocumentToBitmapTimed } from '@/printing/raster/skia-rasterizer';

const dpi = 304;

function doc(lineStyle: string, height: number): LabelDocument {
  return {
    id: 'l',
    name: 'l',
    widthMm: 50,
    heightMm: 30,
    orientation: 0,
    paperType: 'Label',
    mediaShape: 'rectangle',
    background: { type: 'color', color: '#FFFFFF' },
    elements: [
      {
        id: 'ln',
        type: 'line',
        lineStyle,
        virtualInterval: 1,
        rotation: 0,
        left: 5,
        top: 10,
        width: 30,
        height,
        lockMovement: false,
        needPrinting: true,
        drawingColorIndex: 0,
      },
    ],
    updatedAt: 0,
  } as unknown as LabelDocument;
}

function printed(lineStyle: string, height: number, darknessSteps = 0): string {
  const out = rasterizeDocumentToBitmapTimed(doc(lineStyle, height), dpi, {
    threshold: 128,
    darknessSteps,
    bakeTd404Feed: true,
    edgeBorders: td404EdgeBorderOptions(dpi),
    pageWidthPack: 'floor',
    shiftDots: td404ContentShiftDots(dpi, { x: 0, y: 0 }),
  });
  return Buffer.from(out.result.mono1bppBuffer).toString('base64');
}

test('TD-404 print: every line style prints its own pattern, not a solid bar', () => {
  for (const darkness of [0, 2]) {
    const solid = printed('solid', 2, darkness);
    const seen = new Map<string, string>([[solid, 'solid']]);
    for (const style of LINE_STYLE_IDS) {
      if (style === 'solid') continue;
      const bits = printed(style, 2, darkness);
      assert.notEqual(bits, solid, `${style} printed as a solid line (darkness ${darkness})`);
      assert.ok(!seen.has(bits), `${style} prints the same as ${seen.get(bits)} (darkness ${darkness})`);
      seen.set(bits, style);
    }
  }
});

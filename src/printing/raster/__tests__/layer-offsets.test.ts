import assert from 'node:assert/strict';
import type { LabelDocument } from '@/lib/label-document';
import {
  effectiveLayerOffsets,
  labelHasOffsetBorder,
  layerOffsetsOf,
  layerOffsetWarning,
  offsetToPaperFrame,
  previewWithLayerOffsets,
  ZERO_LAYER_OFFSETS,
} from '@/lib/layer-offsets';
import { joshHeadlessRasterOptions } from '@/lib/printer/josh-print';
import { fullBleedBorderElement } from '@/lib/printer/border-calibration';
import {
  mmToDots,
  td404ContentShiftDots,
  td404EdgeBorderOptions,
  td404UserShiftDots,
} from '@/lib/printer/print-spec';
import { rasterizeDocumentToBitmapTimed, type RasterizeOptions } from '@/printing/raster/skia-rasterizer';

// Josh runs at 203 DPI on the device (its 400 dot page is what the border offsets were tuned on).
let dpi = 304;
const W_MM = 50;
const H_MM = 30;
type Mm = { x: number; y: number };
const Z: Mm = { x: 0, y: 0 };

function doc(border: boolean): LabelDocument {
  return {
    id: 'layers',
    name: 'layers',
    widthMm: W_MM,
    heightMm: H_MM,
    orientation: 0,
    paperType: 'Label',
    mediaShape: 'rectangle',
    background: { type: 'color', color: '#FFFFFF' },
    elements: [
      ...(border ? [{ ...fullBleedBorderElement(W_MM, H_MM), left: 2, top: 2, width: 46, height: 26, geometryVersion: 1, lineWidth: 0.5 }] : []),
      { id: 'bar', type: 'shape', shapeType: 'rectangle', left: 20, top: 12, width: 10, height: 6, lineWidth: 0.5, fill: true, needPrinting: true, drawingColorIndex: 0 },
    ],
    updatedAt: 0,
  } as unknown as LabelDocument;
}

type Bridge = 'td404' | 'td404-rot90' | 'josh';

function options(bridge: Bridge, elements: Mm, border: Mm): RasterizeOptions {
  const base = { threshold: 160, backend: 'dot-buffer' as const };
  if (bridge === 'josh') {
    return joshHeadlessRasterOptions(dpi, 0, 0, base, { elements, border });
  }
  const common = {
    ...base,
    bakeTd404Feed: true,
    pageWidthPack: 'floor' as const,
    edgeBorders: td404EdgeBorderOptions(dpi, bridge === 'td404-rot90' ? offsetToPaperFrame(border, 90) : border),
  };
  if (bridge === 'td404') return { ...common, shiftDots: td404ContentShiftDots(dpi, Z, elements) };
  return { ...common, rotationDeg: 90, shiftDots: td404UserShiftDots(dpi, Z, elements), paperShiftDots: td404ContentShiftDots(dpi) };
}

function render(bridge: Bridge, elements: Mm, border: Mm) {
  const t = rasterizeDocumentToBitmapTimed(doc(true), dpi, options(bridge, elements, border));
  return { gray: t.gray, w: t.result.widthDots, h: t.result.heightDots };
}

type Box = { x0: number; y0: number; x1: number; y1: number };
function inkBox(gray: Uint8Array, w: number, h: number, inside: (x: number, y: number) => boolean) {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y) || gray[y * w + x] >= 160) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}
const inBox = (b: Box) => (x: number, y: number) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;

function sameWhere(a: Uint8Array, b: Uint8Array, w: number, h: number, inside: (x: number, y: number) => boolean) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y) && a[y * w + x] !== b[y * w + x]) return false;
  return true;
}

for (const bridge of ['td404', 'td404-rot90', 'josh'] as Bridge[]) {
  dpi = bridge === 'josh' ? 203 : 304;
  const base = render(bridge, Z, Z);
  const { w, h } = base;

  // 1. Zero offsets are the same bytes as the call without the new arguments.
  const legacy =
    bridge === 'josh'
      ? joshHeadlessRasterOptions(dpi, 0, 0, { threshold: 160, backend: 'dot-buffer' })
      : bridge === 'td404'
        ? { threshold: 160, backend: 'dot-buffer' as const, bakeTd404Feed: true, pageWidthPack: 'floor' as const, edgeBorders: td404EdgeBorderOptions(dpi), shiftDots: td404ContentShiftDots(dpi) }
        : { threshold: 160, backend: 'dot-buffer' as const, bakeTd404Feed: true, pageWidthPack: 'floor' as const, edgeBorders: td404EdgeBorderOptions(dpi), rotationDeg: 90 as const, shiftDots: td404UserShiftDots(dpi), paperShiftDots: td404ContentShiftDots(dpi) };
  const legacyOut = rasterizeDocumentToBitmapTimed(doc(true), dpi, legacy);
  assert.deepEqual(legacyOut.gray, base.gray, `${bridge}: 0/0 is bit-identical to before`);

  // The shape sits in the middle of the label; the border hugs the edge.
  const mid: Box =
    bridge === 'td404-rot90'
      ? { x0: Math.round(w * 0.3), y0: Math.round(h * 0.3), x1: Math.round(w * 0.7), y1: Math.round(h * 0.7) }
      : { x0: mmToDots(10, dpi), y0: mmToDots(7, dpi), x1: mmToDots(40, dpi), y1: mmToDots(23, dpi) };
  const inMid = inBox(mid);
  const outMid = (x: number, y: number) => !inMid(x, y);
  const shapeBase = inkBox(base.gray, w, h, inMid);
  const borderBase = inkBox(base.gray, w, h, outMid);

  // Josh's border has little room on the right (its fixed shift already sits there), so it is
  // moved left.
  const shift: Mm = bridge === 'josh' ? { x: -1, y: 0.5 } : { x: 1, y: 0.5 };
  const dx = mmToDots(shift.x, dpi);
  const dy = mmToDots(shift.y, dpi);

  // 2. Border offset moves only the border pixels.
  const b = render(bridge, Z, shift);
  assert.ok(sameWhere(b.gray, base.gray, w, h, inMid), `${bridge}: border offset leaves element pixels untouched`);
  const bBox = inkBox(b.gray, w, h, outMid);
  const [pdx, pdy] = bridge === 'td404-rot90' ? [-dy, dx] : [dx, dy];
  assert.equal(bBox.minX - borderBase.minX, pdx, `${bridge}: border x`);
  assert.equal(bBox.minY - borderBase.minY, pdy, `${bridge}: border y`);
  assert.equal(bBox.maxX - borderBase.maxX, pdx, `${bridge}: border right`);
  assert.equal(bBox.maxY - borderBase.maxY, pdy, `${bridge}: border bottom`);
  assert.equal(b.w, w);
  assert.equal(b.h, h);

  // 3. Elements offset moves only the element pixels.
  const e = render(bridge, shift, Z);
  assert.ok(sameWhere(e.gray, base.gray, w, h, outMid), `${bridge}: elements offset leaves border pixels untouched`);
  assert.equal(e.w, w);
  assert.equal(e.h, h);
  if (bridge !== 'td404-rot90') {
    const sBox = inkBox(e.gray, w, h, inMid);
    assert.equal(sBox.minX - shapeBase.minX, dx, `${bridge}: element x`);
    assert.equal(sBox.minY - shapeBase.minY, dy, `${bridge}: element y`);
  } else {
    const sBox = inkBox(e.gray, w, h, inMid);
    assert.notDeepEqual(sBox, shapeBase, 'rotated: elements move');
  }
}

// 4. Label model: missing means 0, no border means no border offset.
assert.deepEqual(layerOffsetsOf(doc(true)), ZERO_LAYER_OFFSETS);
assert.deepEqual(layerOffsetsOf(null), ZERO_LAYER_OFFSETS);
const saved = { ...doc(true), settings: { elementsOffsetXMm: 1, borderOffsetYMm: -2 } } as unknown as LabelDocument;
assert.deepEqual(layerOffsetsOf(saved), { elements: { x: 1, y: 0 }, border: { x: 0, y: -2 } });
assert.equal(labelHasOffsetBorder(doc(true), 'td404'), true);
assert.equal(labelHasOffsetBorder(doc(false), 'td404'), false);
const asked = { elements: { x: 1, y: 1 }, border: { x: 2, y: 2 } };
assert.deepEqual(effectiveLayerOffsets(doc(false), asked, 'td404').border, Z);
assert.deepEqual(effectiveLayerOffsets(doc(true), asked, 'td404'), asked);
assert.equal(previewWithLayerOffsets(doc(false), { elements: Z, border: Z }, 'josh').elements.length, 1);
const prev = previewWithLayerOffsets(doc(true), asked, 'td404');
assert.equal(prev.elements.find((x) => x.id === 'bar')!.left, 21);
assert.equal(prev.elements.find((x) => x.type === 'border')!.left, 2 + 2);
assert.deepEqual(offsetToPaperFrame({ x: 1, y: 2 }, 90), { x: -2, y: 1 });
assert.deepEqual(offsetToPaperFrame({ x: 1, y: 2 }, 270), { x: 2, y: -1 });
assert.deepEqual(offsetToPaperFrame({ x: 1, y: 2 }, 180), { x: -1, y: -2 });

// 5. Warning: only when the user's offset pushes ink past the edge.
const warn = (offsets: typeof asked) =>
  layerOffsetWarning({ doc: doc(true), bridge: 'td404', offsets, elementsBakedMm: { x: 0, y: 2 }, dpi });
assert.equal(warn(ZERO_LAYER_OFFSETS), null);
assert.equal(warn({ elements: { x: 1, y: 0 }, border: Z }), null);
assert.match(warn({ elements: { x: 30, y: 0 }, border: Z }) ?? '', /elements/i);
assert.match(warn({ elements: Z, border: { x: 9, y: 0 } }) ?? '', /border/i);

console.log('ok layer-offsets');
